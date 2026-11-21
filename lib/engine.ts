/**
 * The auction rules, as pure functions.
 *
 * Every store (in-memory, Redis) calls these, so the rules live in exactly one
 * place and are covered by unit tests. Nothing here reads a clock: callers pass
 * `now` from the single authoritative clock of the store.
 */
import type { Auction, AuctionStatus, Bid, BidInput, BidRejection, CreateAuctionInput, Money } from "./types";

/** A bid arriving in the final SNIPE_WINDOW_MS pushes the close to now + SNIPE_WINDOW_MS. */
export const SNIPE_WINDOW_MS = 10_000;
/** Below this, the UI shows the auction as "closing". */
export const CLOSING_SOON_MS = 30_000;
export const MAX_PRICE: Money = 1_000_000_000;
export const MAX_BIDS_KEPT = 50;

export function statusOf(auction: Auction, now: number): AuctionStatus {
  const left = auction.endsAt - now;
  if (left <= 0) return "closed";
  if (left <= CLOSING_SOON_MS) return "closing";
  return "live";
}

export function minNextBid(auction: Auction): Money {
  return auction.bidCount === 0 ? auction.startingPrice : auction.currentPrice + auction.minIncrement;
}

export type BidDecision =
  | { ok: true; auction: Auction; bid: Bid }
  | { ok: false; reason: BidRejection; message: string; minNextBid?: Money };

/**
 * Decide whether a bid is accepted and, if so, return the next auction state.
 * Closing is a consequence of time alone: once `now >= endsAt` no bid is ever
 * accepted again, so the leader at that instant is the winner. No job has to
 * "close" the auction for the result to be final.
 */
export function decideBid(auction: Auction, input: BidInput, now: number): BidDecision {
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > MAX_PRICE) {
    return { ok: false, reason: "INVALID", message: "Bid must be a whole amount." };
  }
  if (!input.bidderId || !input.bidderName.trim()) {
    return { ok: false, reason: "INVALID", message: "Pick a display name before bidding." };
  }
  if (now >= auction.endsAt) {
    return { ok: false, reason: "AUCTION_CLOSED", message: "This auction has closed." };
  }
  if (auction.leaderId === input.bidderId) {
    return { ok: false, reason: "ALREADY_LEADING", message: "You already hold the top bid.", minNextBid: minNextBid(auction) };
  }
  const min = minNextBid(auction);
  if (input.amount < min) {
    return { ok: false, reason: "BID_TOO_LOW", message: "Someone got there first — the price moved up.", minNextBid: min };
  }

  const extended = auction.endsAt - now < SNIPE_WINDOW_MS;
  const bid: Bid = {
    id: input.bidId,
    auctionId: auction.id,
    bidderId: input.bidderId,
    bidderName: input.bidderName.trim().slice(0, 24),
    amount: input.amount,
    at: now,
    extended,
  };
  const next: Auction = {
    ...auction,
    currentPrice: input.amount,
    leaderId: input.bidderId,
    leaderName: bid.bidderName,
    bidCount: auction.bidCount + 1,
    endsAt: extended ? now + SNIPE_WINDOW_MS : auction.endsAt,
    extensions: auction.extensions + (extended ? 1 : 0),
    version: auction.version + 1,
  };
  return { ok: true, auction: next, bid };
}

export type CreateValidation = { ok: true; value: CreateAuctionInput } | { ok: false; message: string };

export function validateCreate(raw: unknown): CreateValidation {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const description = typeof r.description === "string" ? r.description.trim() : "";
  const startingPrice = Number(r.startingPrice);
  const minIncrement = Number(r.minIncrement);
  const durationMinutes = Number(r.durationMinutes);
  if (title.length < 3 || title.length > 80) return { ok: false, message: "Title must be 3–80 characters." };
  if (description.length > 400) return { ok: false, message: "Description must be under 400 characters." };
  if (!Number.isInteger(startingPrice) || startingPrice < 1 || startingPrice > MAX_PRICE)
    return { ok: false, message: "Starting price must be a whole number of at least 1." };
  if (!Number.isInteger(minIncrement) || minIncrement < 1 || minIncrement > startingPrice * 10 + 1000)
    return { ok: false, message: "Minimum increment must be a whole number of at least 1." };
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60)
    return { ok: false, message: "Duration must be between 1 minute and 24 hours." };
  return { ok: true, value: { title, description, startingPrice, minIncrement, durationMinutes } };
}

export function newAuction(id: string, input: CreateAuctionInput, now: number, hue?: number): Auction {
  const endsAt = now + Math.round(input.durationMinutes * 60_000);
  return {
    id,
    title: input.title,
    description: input.description ?? "",
    hue: hue ?? hashHue(input.title),
    startingPrice: input.startingPrice,
    minIncrement: input.minIncrement,
    currentPrice: input.startingPrice,
    leaderId: null,
    leaderName: null,
    bidCount: 0,
    createdAt: now,
    originalEndsAt: endsAt,
    endsAt,
    extensions: 0,
    version: 0,
  };
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function newId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
