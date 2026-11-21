/**
 * Redis-backed store (any Redis 6.2+ over TCP/TLS via REDIS_URL), safe across
 * many serverless instances.
 *
 * Bids use optimistic concurrency:
 *   1. read the auction and Redis's clock,
 *   2. run the pure `decideBid` rules in TypeScript,
 *   3. commit with a Lua script that succeeds only if the version is unchanged
 *      AND Redis's own clock is still before the close time, then PUBLISHes
 *      the new version so every instance can push it to its watchers.
 * Lua scripts run atomically inside Redis, so two bids can never both win the
 * same price step, and no bid can land after the close — one clock decides.
 */
import Redis from "ioredis";
import { decideBid, MAX_BIDS_KEPT, minNextBid, newAuction, newId } from "../engine";
import type { Auction, Bid, BidInput, BidResult, CreateAuctionInput, User } from "../types";
import type { AuctionStore } from "./types";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 12;

const k = {
  index: "auc:index",
  auction: (id: string) => `auc:${id}`,
  bids: (id: string) => `auc:${id}:bids`,
  ids: (id: string) => `auc:${id}:ids`,
  channel: (id: string) => `auc:${id}:events`,
  lock: (key: string) => `lock:${key}`,
  user: (username: string) => `user:${username.toLowerCase()}`,
};

/*
 * KEYS: 1 auction, 2 bids list, 3 seen bid ids
 * ARGV: 1 expected version, 2 next auction JSON, 3 bid JSON, 4 bid id,
 *       5 max bids kept, 6 expire-at (ms), 7 pub/sub channel, 8 next version
 */
const COMMIT_BID = `
local cur = redis.call('GET', KEYS[1])
if not cur then return {'NOT_FOUND', '0'} end
local t = redis.call('TIME')
local nowMs = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
if redis.call('SISMEMBER', KEYS[3], ARGV[4]) == 1 then return {'DUPLICATE', tostring(nowMs)} end
local a = cjson.decode(cur)
if tostring(a.version) ~= ARGV[1] then return {'CONFLICT', tostring(nowMs)} end
if nowMs >= tonumber(a.endsAt) then return {'CLOSED', tostring(nowMs)} end
redis.call('SET', KEYS[1], ARGV[2], 'PXAT', ARGV[6])
redis.call('LPUSH', KEYS[2], ARGV[3])
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[5]) - 1)
redis.call('PEXPIREAT', KEYS[2], ARGV[6])
redis.call('SADD', KEYS[3], ARGV[4])
redis.call('PEXPIREAT', KEYS[3], ARGV[6])
redis.call('PUBLISH', ARGV[7], ARGV[8])
return {'OK', tostring(nowMs)}
`;

const parse = <T>(v: string | null): T | null => (v == null ? null : (JSON.parse(v) as T));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RedisStore implements AuctionStore {
  readonly kind = "redis" as const;
  private sub: Redis | null = null;
  private listeners = new Map<string, Set<() => void>>();

  constructor(private redis: Redis) {}

  async now() {
    const [s, us] = await this.redis.time();
    return Number(s) * 1000 + Math.floor(Number(us) / 1000);
  }

  private async getAuction(id: string) {
    return parse<Auction>(await this.redis.get(k.auction(id)));
  }

  async list(limit = 100) {
    const [now, ids] = await Promise.all([this.now(), this.redis.zrevrange(k.index, 0, limit - 1)]);
    if (ids.length === 0) return { auctions: [], serverNow: now };
    const raw = await this.redis.mget(...ids.map(k.auction));
    const auctions = raw.map((r) => parse<Auction>(r)).filter((a): a is Auction => !!a);
    if (auctions.length < ids.length) {
      // Expired auctions: drop them from the index.
      const live = new Set(auctions.map((a) => a.id));
      const gone = ids.filter((id) => !live.has(id));
      if (gone.length) await this.redis.zrem(k.index, ...gone);
    }
    return { auctions, serverNow: now };
  }

  async snapshot(id: string) {
    const [auction, rawBids, now] = await Promise.all([
      this.getAuction(id),
      this.redis.lrange(k.bids(id), 0, MAX_BIDS_KEPT - 1),
      this.now(),
    ]);
    if (!auction) return null;
    const bids = rawBids.map((b) => parse<Bid>(b)!).filter(Boolean);
    return { auction, bids, serverNow: now };
  }

  async version(id: string) {
    return (await this.getAuction(id))?.version ?? null;
  }

  async create(input: CreateAuctionInput, hue?: number) {
    const now = await this.now();
    const auction = newAuction(newId(), input, now, hue);
    const expireAt = auction.endsAt + RETENTION_MS;
    await this.redis
      .multi()
      .set(k.auction(auction.id), JSON.stringify(auction), "PXAT", expireAt)
      .zadd(k.index, auction.createdAt, auction.id)
      .zremrangebyscore(k.index, 0, now - RETENTION_MS)
      .exec();
    return auction;
  }

  async placeBid(input: BidInput): Promise<BidResult> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const [auction, now] = await Promise.all([this.getAuction(input.auctionId), this.now()]);
      if (!auction) return { ok: false, reason: "NOT_FOUND", message: "Auction not found.", serverNow: now };

      const d = decideBid(auction, input, now);
      if (!d.ok) {
        // A retry of a bid that already went through looks like ALREADY_LEADING; report it as success.
        if (d.reason === "ALREADY_LEADING") {
          const dup = await this.findBid(input);
          if (dup) return { ok: true, duplicate: true, auction, bid: dup, serverNow: now };
        }
        return { ...d, auction, minNextBid: d.minNextBid ?? minNextBid(auction), serverNow: now };
      }

      const expireAt = d.auction.endsAt + RETENTION_MS;
      const [status, at] = (await this.redis.eval(
        COMMIT_BID,
        3,
        k.auction(auction.id),
        k.bids(auction.id),
        k.ids(auction.id),
        String(auction.version),
        JSON.stringify(d.auction),
        JSON.stringify(d.bid),
        input.bidId,
        String(MAX_BIDS_KEPT),
        String(expireAt),
        k.channel(auction.id),
        String(d.auction.version),
      )) as [string, string];
      const serverNow = Number(at);

      switch (status) {
        case "OK":
          return { ok: true, auction: d.auction, bid: d.bid, serverNow };
        case "NOT_FOUND":
          return { ok: false, reason: "NOT_FOUND", message: "Auction not found.", serverNow };
        case "CLOSED":
          return { ok: false, reason: "AUCTION_CLOSED", message: "This auction has closed.", auction, serverNow };
        case "DUPLICATE": {
          const snap = await this.snapshot(auction.id);
          const bid = snap?.bids.find((b) => b.id === input.bidId);
          if (snap && bid) return { ok: true, duplicate: true, auction: snap.auction, bid, serverNow };
          break;
        }
        case "CONFLICT":
          // Someone else's bid landed between our read and our write. Re-read and re-decide.
          await sleep(5 + Math.random() * 20 * (attempt + 1));
          break;
      }
    }
    return { ok: false, reason: "BUSY", message: "Bidding is very busy — please try again.", serverNow: await this.now() };
  }

  private async findBid(input: BidInput) {
    const isMember = await this.redis.sismember(k.ids(input.auctionId), input.bidId);
    if (!isMember) return null;
    const raw = await this.redis.lrange(k.bids(input.auctionId), 0, MAX_BIDS_KEPT - 1);
    return raw.map((b) => parse<Bid>(b)!).find((b) => b.id === input.bidId) ?? null;
  }

  async once(key: string, ttlMs: number, fn: () => Promise<void>) {
    const got = await this.redis.set(k.lock(key), "1", "PX", ttlMs, "NX");
    if (got === "OK") await fn();
  }

  async getUser(username: string) {
    return parse<User>(await this.redis.get(k.user(username)));
  }

  async createUser(user: User) {
    const got = await this.redis.set(k.user(user.username), JSON.stringify(user), "NX");
    return got === "OK";
  }

  /**
   * One subscriber connection per server instance, shared by every watcher
   * on that instance. Redis delivers each accepted bid once per instance.
   */
  subscribe(id: string, listener: () => void) {
    const channel = k.channel(id);
    if (!this.sub) {
      this.sub = this.redis.duplicate();
      this.sub.on("message", (ch: string) => this.listeners.get(ch)?.forEach((fn) => fn()));
    }
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      void this.sub.subscribe(channel).catch(() => {});
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.listeners.delete(channel);
        void this.sub?.unsubscribe(channel).catch(() => {});
      }
    };
  }
}

export function redisFromEnv(): Redis | null {
  const url = process.env.REDIS_URL ?? process.env.KV_URL;
  if (!url) return null;
  const g = globalThis as unknown as { __redis?: Redis };
  // Reuse one connection per server instance across requests.
  g.__redis ??= new Redis(url, { maxRetriesPerRequest: 2, enableAutoPipelining: true, connectTimeout: 5000 });
  return g.__redis;
}
