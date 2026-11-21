import { describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/store/memory";

describe("memory store", () => {
  it("accepts exactly one of many simultaneous bids at the same price", async () => {
    const a = await memoryStore.create({ title: "Race item", startingPrice: 500, minIncrement: 50, durationMinutes: 1 });
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        memoryStore.placeBid({ auctionId: a.id, bidId: `b${i}`, bidderId: `u${i}`, bidderName: `User ${i}`, amount: 500 }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const snap = await memoryStore.snapshot(a.id);
    expect(snap?.auction.bidCount).toBe(1);
  });

  it("is idempotent: retrying the same bid id never places it twice", async () => {
    const a = await memoryStore.create({ title: "Retry item", startingPrice: 100, minIncrement: 10, durationMinutes: 1 });
    const input = { auctionId: a.id, bidId: "same", bidderId: "u1", bidderName: "U1", amount: 100 };
    const r1 = await memoryStore.placeBid(input);
    const r2 = await memoryStore.placeBid(input);
    expect(r1.ok && r2.ok).toBe(true);
    expect(r2.ok && r2.duplicate).toBe(true);
    expect((await memoryStore.snapshot(a.id))?.auction.bidCount).toBe(1);
  });

  it("notifies subscribers when a bid lands", async () => {
    const a = await memoryStore.create({ title: "Notify item", startingPrice: 100, minIncrement: 10, durationMinutes: 1 });
    let calls = 0;
    const off = memoryStore.subscribe(a.id, () => calls++);
    await memoryStore.placeBid({ auctionId: a.id, bidId: "x", bidderId: "u", bidderName: "U", amount: 100 });
    off();
    expect(calls).toBe(1);
  });
});
