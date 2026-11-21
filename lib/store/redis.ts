/**
 * Redis-backed store (Upstash REST), safe across many serverless instances.
 *
 * Bids use optimistic concurrency:
 *   1. read the auction and Redis's clock,
 *   2. run the pure `decideBid` rules in TypeScript,
 *   3. commit with a Lua script that succeeds only if the version is unchanged
 *      AND Redis's own clock is still before the close time.
 * Lua scripts run atomically inside Redis, so two bids can never both win the
 * same price step, and no bid can land after the close — one clock decides.
 */
import { Redis } from "@upstash/redis";
import { decideBid, MAX_BIDS_KEPT, minNextBid, newAuction, newId } from "../engine";
import type { Auction, Bid, BidInput, BidResult, CreateAuctionInput } from "../types";
import type { AuctionStore } from "./types";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 12;

const k = {
  index: "auc:index",
  auction: (id: string) => `auc:${id}`,
  bids: (id: string) => `auc:${id}:bids`,
  ids: (id: string) => `auc:${id}:ids`,
  lock: (key: string) => `lock:${key}`,
};

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
return {'OK', tostring(nowMs)}
`;

function parse<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v) as T;
  return v as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RedisStore implements AuctionStore {
  readonly kind = "redis" as const;
  constructor(private redis: Redis) {}

  async now() {
    const [s, us] = (await this.redis.time()) as [number, number];
    return Number(s) * 1000 + Math.floor(Number(us) / 1000);
  }

  private async getAuction(id: string) {
    return parse<Auction>(await this.redis.get(k.auction(id)));
  }

  async list(limit = 100) {
    const now = await this.now();
    const ids = (await this.redis.zrange(k.index, 0, limit - 1, { rev: true })) as string[];
    if (ids.length === 0) return { auctions: [], serverNow: now };
    const raw = await this.redis.mget<unknown[]>(...ids.map(k.auction));
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
    const bids = (rawBids as unknown[]).map((b) => parse<Bid>(b)!).filter(Boolean);
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
      .set(k.auction(auction.id), JSON.stringify(auction), { pxat: expireAt })
      .zadd(k.index, { score: auction.createdAt, member: auction.id })
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
        [k.auction(auction.id), k.bids(auction.id), k.ids(auction.id)],
        [String(auction.version), JSON.stringify(d.auction), JSON.stringify(d.bid), input.bidId, String(MAX_BIDS_KEPT), String(expireAt)],
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
    const raw = (await this.redis.lrange(k.bids(input.auctionId), 0, MAX_BIDS_KEPT - 1)) as unknown[];
    return raw.map((b) => parse<Bid>(b)!).find((b) => b.id === input.bidId) ?? null;
  }

  async once(key: string, ttlMs: number, fn: () => Promise<void>) {
    const got = await this.redis.set(k.lock(key), "1", { nx: true, px: ttlMs });
    if (got === "OK") await fn();
  }
}

export function redisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, automaticDeserialization: false });
}
