import type { Auction, AuctionSnapshot, BidInput, BidResult, CreateAuctionInput } from "../types";

export interface AuctionStore {
  readonly kind: "memory" | "redis";
  /** The single clock every decision is made against. */
  now(): Promise<number>;
  list(limit?: number): Promise<{ auctions: Auction[]; serverNow: number }>;
  snapshot(id: string): Promise<AuctionSnapshot | null>;
  /** Cheap check used by the live stream to detect changes. */
  version(id: string): Promise<number | null>;
  create(input: CreateAuctionInput, hue?: number): Promise<Auction>;
  placeBid(input: BidInput): Promise<BidResult>;
  /** Runs `fn` at most once per `ttlMs` across all server instances. */
  once(key: string, ttlMs: number, fn: () => Promise<void>): Promise<void>;
  /** Memory store only: push-based change notifications. */
  subscribe?(id: string, listener: () => void): () => void;
}
