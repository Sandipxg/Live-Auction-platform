/** Money is stored as whole rupees (integers) to avoid floating-point drift. */
export type Money = number;

export interface Auction {
  id: string;
  title: string;
  description: string;
  /** Hue (0-359) used to draw the item's tile. */
  hue: number;
  startingPrice: Money;
  minIncrement: Money;
  /** Highest accepted bid, or the starting price when nobody has bid yet. */
  currentPrice: Money;
  leaderId: string | null;
  leaderName: string | null;
  bidCount: number;
  createdAt: number;
  /** When the auction was scheduled to end before any anti-snipe extensions. */
  originalEndsAt: number;
  /** Authoritative close time. Moves forward when a late bid arrives. */
  endsAt: number;
  extensions: number;
  /** Increments on every accepted bid. Clients drop any update older than what they hold. */
  version: number;
}

export interface Bid {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  amount: Money;
  at: number;
  /** True when this bid pushed the close time back. */
  extended: boolean;
}

export type AuctionStatus = "live" | "closing" | "closed";

export interface AuctionSnapshot {
  auction: Auction;
  bids: Bid[];
  /** Server clock at the moment the snapshot was taken, so clients can sync their countdown. */
  serverNow: number;
}

export interface BidInput {
  auctionId: string;
  /** Client-generated id. Re-sending the same id never places a second bid. */
  bidId: string;
  bidderId: string;
  bidderName: string;
  amount: Money;
}

export type BidRejection =
  | "NOT_FOUND"
  | "AUCTION_CLOSED"
  | "BID_TOO_LOW"
  | "ALREADY_LEADING"
  | "INVALID"
  | "UNAUTHORIZED"
  | "BUSY";

export type BidResult =
  | { ok: true; auction: Auction; bid: Bid; duplicate?: boolean; serverNow: number }
  | { ok: false; reason: BidRejection; message: string; auction?: Auction; minNextBid?: Money; serverNow: number };

export interface User {
  id: string;
  /** Lower-case login name, unique. */
  username: string;
  /** Shown on bids and as the winner. */
  displayName: string;
  /** `scrypt$<salt>$<hash>` — never the password itself. */
  passwordHash: string;
  createdAt: number;
}

/** What the browser is allowed to know about the signed-in user. */
export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
}

export interface CreateAuctionInput {
  title: string;
  description?: string;
  startingPrice: Money;
  minIncrement: Money;
  durationMinutes: number;
}
