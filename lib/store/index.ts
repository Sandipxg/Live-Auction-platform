import "server-only";
import { memoryStore } from "./memory";
import { RedisStore, redisFromEnv } from "./redis";
import type { AuctionStore } from "./types";

let store: AuctionStore | undefined;

/** Redis when credentials are present, otherwise the in-process memory store. */
export function getStore(): AuctionStore {
  if (store) return store;
  const redis = redisFromEnv();
  store = redis ? new RedisStore(redis) : memoryStore;
  return store;
}

export type { AuctionStore };
