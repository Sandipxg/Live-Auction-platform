import type { Auction, AuctionSnapshot, BidInput, BidResult, CreateAuctionInput, User } from "../types";

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
  /** Called whenever a bid on this auction is accepted, on any server instance. */
  subscribe(id: string, listener: () => void): () => void;

  /** Users (demo auth). Usernames are case-insensitive. */
  getUser(username: string): Promise<User | null>;
  /** Returns false if the username is already taken. Atomic. */
  createUser(user: User): Promise<boolean>;
}
