/**
 * Runs against a real Redis when REDIS_TEST_URL is set, e.g.
 *   redis-server --port 6390 &  REDIS_TEST_URL=redis://localhost:6390 npm test
 * The database is flushed before the suite.
 */
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisStore } from "@/lib/store/redis";

const url = process.env.REDIS_TEST_URL;

describe.skipIf(!url)("redis store", () => {
  let redis: Redis;
  let store: RedisStore;

  beforeAll(async () => {
    redis = new Redis(url!);
    await redis.flushdb();
    store = new RedisStore(redis);
  });
  afterAll(async () => {
    redis.disconnect();
    (store as unknown as { sub: Redis | null }).sub?.disconnect();
  });

  it("accepts exactly one of many simultaneous bids at the same price", async () => {
    const a = await store.create({ title: "Race item", startingPrice: 500, minIncrement: 50, durationMinutes: 1 });
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        store.placeBid({ auctionId: a.id, bidId: `b${i}`, bidderId: `u${i}`, bidderName: `User ${i}`, amount: 500 }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await store.snapshot(a.id))?.auction.bidCount).toBe(1);
  });

  it("a race of rising bids never loses or duplicates one", async () => {
    const a = await store.create({ title: "Climb item", startingPrice: 100, minIncrement: 10, durationMinutes: 1 });
    // 20 bidders each bid a distinct, valid amount at once; every accepted bid must be in the history.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.placeBid({ auctionId: a.id, bidId: `c${i}`, bidderId: `v${i}`, bidderName: `V${i}`, amount: 100 + i * 10 }),
      ),
    );
    const accepted = results.filter((r) => r.ok).length;
    const snap = (await store.snapshot(a.id))!;
    expect(snap.auction.bidCount).toBe(accepted);
    expect(snap.bids).toHaveLength(accepted);
    const amounts = snap.bids.map((b) => b.amount);
    expect([...amounts].sort((x, y) => y - x)).toEqual(amounts); // strictly rising over time
  });

  it("is idempotent: retrying the same bid id never places it twice", async () => {
    const a = await store.create({ title: "Retry item", startingPrice: 100, minIncrement: 10, durationMinutes: 1 });
    const input = { auctionId: a.id, bidId: "same", bidderId: "u1", bidderName: "U1", amount: 100 };
    const r1 = await store.placeBid(input);
    const r2 = await store.placeBid(input);
    expect(r1.ok && r2.ok).toBe(true);
    expect(r2.ok && r2.duplicate).toBe(true);
    expect((await store.snapshot(a.id))?.auction.bidCount).toBe(1);
  });

  it("rejects bids once Redis's clock passes the close time", async () => {
    const a = await store.create({ title: "Closed item", startingPrice: 100, minIncrement: 10, durationMinutes: 1 });
    const closed = { ...a, endsAt: (await store.now()) - 1 };
    await redis.set(`auc:${a.id}`, JSON.stringify(closed));
    const r = await store.placeBid({ auctionId: a.id, bidId: "late", bidderId: "u", bidderName: "U", amount: 100 });
    expect(r).toMatchObject({ ok: false, reason: "AUCTION_CLOSED" });
  });

  it("publishes accepted bids to subscribers", async () => {
    const a = await store.create({ title: "Notify item", startingPrice: 100, minIncrement: 10, durationMinutes: 1 });
    let calls = 0;
    const off = store.subscribe(a.id, () => calls++);
    await new Promise((r) => setTimeout(r, 100)); // let SUBSCRIBE reach Redis
    await store.placeBid({ auctionId: a.id, bidId: "x", bidderId: "u", bidderName: "U", amount: 100 });
    await new Promise((r) => setTimeout(r, 100));
    off();
    expect(calls).toBe(1);
  });

  it("creates users atomically with unique usernames", async () => {
    const u = { id: "1", username: "alice", displayName: "Alice", passwordHash: "x", createdAt: 0 };
    expect(await store.createUser(u)).toBe(true);
    expect(await store.createUser({ ...u, id: "2", username: "ALICE" })).toBe(false);
    expect((await store.getUser("Alice"))?.id).toBe("1");
  });
});
