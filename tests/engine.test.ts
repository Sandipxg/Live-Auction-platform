import { describe, expect, it } from "vitest";
import { decideBid, minNextBid, newAuction, SNIPE_WINDOW_MS, statusOf, validateCreate } from "@/lib/engine";
import type { Auction, BidInput } from "@/lib/types";

const T0 = 1_800_000_000_000;
const make = (): Auction =>
  newAuction("a1", { title: "Test item", startingPrice: 1000, minIncrement: 100, durationMinutes: 5 }, T0);
const bid = (over: Partial<BidInput> = {}): BidInput => ({
  auctionId: "a1",
  bidId: Math.random().toString(36),
  bidderId: "alice",
  bidderName: "Alice",
  amount: 1000,
  ...over,
});

describe("decideBid", () => {
  it("accepts an opening bid at the starting price", () => {
    const d = decideBid(make(), bid(), T0 + 1000);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.auction.currentPrice).toBe(1000);
      expect(d.auction.leaderId).toBe("alice");
      expect(d.auction.version).toBe(1);
    }
  });

  it("rejects an opening bid below the starting price", () => {
    const d = decideBid(make(), bid({ amount: 999 }), T0);
    expect(d).toMatchObject({ ok: false, reason: "BID_TOO_LOW", minNextBid: 1000 });
  });

  it("requires each later bid to beat the current price by the increment", () => {
    const first = decideBid(make(), bid(), T0);
    if (!first.ok) throw new Error();
    expect(minNextBid(first.auction)).toBe(1100);
    expect(decideBid(first.auction, bid({ bidderId: "bob", bidderName: "Bob", amount: 1099 }), T0).ok).toBe(false);
    expect(decideBid(first.auction, bid({ bidderId: "bob", bidderName: "Bob", amount: 1100 }), T0).ok).toBe(true);
  });

  it("stops the leader from bidding against themselves", () => {
    const first = decideBid(make(), bid(), T0);
    if (!first.ok) throw new Error();
    expect(decideBid(first.auction, bid({ amount: 5000 }), T0)).toMatchObject({ ok: false, reason: "ALREADY_LEADING" });
  });

  it("rejects every bid at or after the close time — the leader then is the winner", () => {
    const a = make();
    expect(decideBid(a, bid(), a.endsAt)).toMatchObject({ ok: false, reason: "AUCTION_CLOSED" });
    expect(decideBid(a, bid(), a.endsAt + 1)).toMatchObject({ ok: false, reason: "AUCTION_CLOSED" });
    expect(decideBid(a, bid(), a.endsAt - 1).ok).toBe(true);
  });

  it("extends the clock to 10s when a bid lands in the final 10s", () => {
    const a = make();
    const late = a.endsAt - 3000;
    const d = decideBid(a, bid(), late);
    expect(d.ok && d.auction.endsAt).toBe(late + SNIPE_WINDOW_MS);
    expect(d.ok && d.auction.extensions).toBe(1);
    expect(d.ok && d.bid.extended).toBe(true);
  });

  it("does not extend a bid placed with more than 10s left", () => {
    const a = make();
    const d = decideBid(a, bid(), a.endsAt - SNIPE_WINDOW_MS - 1);
    expect(d.ok && d.auction.endsAt).toBe(a.endsAt);
    expect(d.ok && d.bid.extended).toBe(false);
  });

  it("keeps extending through a bidding war until 10 quiet seconds pass", () => {
    let a = make();
    let now = a.endsAt - 1000;
    const bidders = ["alice", "bob"];
    for (let i = 0; i < 20; i++) {
      const d = decideBid(a, bid({ bidderId: bidders[i % 2], bidderName: bidders[i % 2], amount: minNextBid(a) }), now);
      if (!d.ok) throw new Error(d.message);
      a = d.auction;
      now += 9000; // each bid arrives 9s after the last, inside the window
    }
    expect(a.extensions).toBe(20);
    expect(statusOf(a, now)).not.toBe("closed");
    expect(statusOf(a, a.endsAt)).toBe("closed");
  });

  it("rejects non-integer and missing-name bids", () => {
    expect(decideBid(make(), bid({ amount: 1000.5 }), T0)).toMatchObject({ reason: "INVALID" });
    expect(decideBid(make(), bid({ bidderName: "  " }), T0)).toMatchObject({ reason: "INVALID" });
  });
});

describe("validateCreate", () => {
  it("accepts a valid auction", () => {
    expect(validateCreate({ title: "Lamp", startingPrice: 100, minIncrement: 10, durationMinutes: 5 }).ok).toBe(true);
  });
  it("rejects bad input", () => {
    expect(validateCreate({ title: "x", startingPrice: 100, minIncrement: 10, durationMinutes: 5 }).ok).toBe(false);
    expect(validateCreate({ title: "Lamp", startingPrice: 0, minIncrement: 10, durationMinutes: 5 }).ok).toBe(false);
    expect(validateCreate({ title: "Lamp", startingPrice: 100, minIncrement: 10, durationMinutes: 0 }).ok).toBe(false);
  });
});
