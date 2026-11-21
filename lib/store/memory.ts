/**
 * Single-process store. Node runs JavaScript on one thread, so each call below
 * is naturally atomic: no two bids can interleave inside `placeBid`.
 * Used for local development and as a fallback when Redis is not configured.
 */
import { EventEmitter } from "node:events";
import { decideBid, MAX_BIDS_KEPT, minNextBid, newAuction, newId } from "../engine";
import type { Auction, Bid, BidInput, BidResult, CreateAuctionInput } from "../types";
import type { AuctionStore } from "./types";

interface Entry {
  auction: Auction;
  bids: Bid[];
  seenBidIds: Set<string>;
}

class MemoryStore implements AuctionStore {
  readonly kind = "memory" as const;
  private entries = new Map<string, Entry>();
  private locks = new Map<string, number>();
  private events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(0);
  }

  async now() {
    return Date.now();
  }

  async list(limit = 100) {
    const auctions = [...this.entries.values()]
      .map((e) => e.auction)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    return { auctions, serverNow: Date.now() };
  }

  async snapshot(id: string) {
    const e = this.entries.get(id);
    if (!e) return null;
    return { auction: e.auction, bids: e.bids, serverNow: Date.now() };
  }

  async version(id: string) {
    return this.entries.get(id)?.auction.version ?? null;
  }

  async create(input: CreateAuctionInput, hue?: number) {
    const auction = newAuction(newId(), input, Date.now(), hue);
    this.entries.set(auction.id, { auction, bids: [], seenBidIds: new Set() });
    return auction;
  }

  async placeBid(input: BidInput): Promise<BidResult> {
    const now = Date.now();
    const e = this.entries.get(input.auctionId);
    if (!e) return { ok: false, reason: "NOT_FOUND", message: "Auction not found.", serverNow: now };

    if (e.seenBidIds.has(input.bidId)) {
      const bid = e.bids.find((b) => b.id === input.bidId);
      if (bid) return { ok: true, duplicate: true, auction: e.auction, bid, serverNow: now };
    }

    const d = decideBid(e.auction, input, now);
    if (!d.ok) return { ...d, auction: e.auction, minNextBid: d.minNextBid ?? minNextBid(e.auction), serverNow: now };

    e.auction = d.auction;
    e.bids = [d.bid, ...e.bids].slice(0, MAX_BIDS_KEPT);
    e.seenBidIds.add(d.bid.id);
    this.events.emit(input.auctionId);
    return { ok: true, auction: d.auction, bid: d.bid, serverNow: now };
  }

  async once(key: string, ttlMs: number, fn: () => Promise<void>) {
    const until = this.locks.get(key) ?? 0;
    if (Date.now() < until) return;
    this.locks.set(key, Date.now() + ttlMs);
    await fn();
  }

  subscribe(id: string, listener: () => void) {
    this.events.on(id, listener);
    return () => {
      this.events.off(id, listener);
    };
  }
}

// Survive Next.js hot reloads in development.
const g = globalThis as unknown as { __memoryStore?: MemoryStore };
export const memoryStore: MemoryStore = g.__memoryStore ?? (g.__memoryStore = new MemoryStore());
