# Tasks — live progress tracker

Legend: ✅ done · 🟡 in progress · ⬜ planned

_Last updated: 2026-11-21 (v0.2)_

## Milestone 1 — Simple, correct core (v0.1) ✅

| Status | Task | Notes |
|---|---|---|
| ✅ | Project scaffold (Next.js 15, TypeScript, Vitest) | |
| ✅ | Pure auction rules engine (`lib/engine.ts`) | Bid validation, increments, anti‑snipe, status |
| ✅ | In‑memory store (local dev) | Single process ⇒ naturally atomic |
| ✅ | Redis store with atomic compare‑and‑set (Lua) | One clock (Redis `TIME`) decides the close |
| ✅ | Idempotent bids (`bidId`) | Safe retries in the final seconds |
| ✅ | REST API: list, create, snapshot, bid | |
| ✅ | Live updates over Server‑Sent Events | Push (memory); Redis pub/sub since v0.2 |
| ✅ | Server‑synced countdown | Clients apply server clock offset |
| ✅ | Lobby with live prices and countdowns | Open / Ended tabs |
| ✅ | Auction room: price, clock, bid panel, history, winner banner | Outbid alert, extension notice |
| ✅ | Create auction form | |
| ✅ | Self‑refilling demo inventory | Keeps ≥ 6 auctions open on the public demo |
| ✅ | Unit tests (14) | Engine rules + concurrency + idempotency |
| ✅ | Docs: Aim, Tasks, Context, Architecture, Decisions; README with diagrams | |
| ✅ | Deploy to Vercel | https://live-auction-platform-alpha.vercel.app |

## Milestone 2 — Real shared state + accounts (v0.2) ✅

| Status | Task | Notes |
|---|---|---|
| ✅ | Connect Redis on Vercel (Redis Cloud via Marketplace, `REDIS_URL`) | Shared state across all instances |
| ✅ | Switch to ioredis (TCP/TLS) | Replaces Upstash REST client |
| ✅ | Push bids with Redis pub/sub | 69–77 ms across two instances (local test) |
| ✅ | Demo auth: sign up, log in, log out | scrypt + signed httpOnly cookie |
| ✅ | Login required to bid and to start an auction; watching stays public | |
| ✅ | Bidder identity taken from session only | Forged body ignored (E2E) |
| ✅ | One‑tap demo accounts (Alice, Bob, Priya) | |
| ✅ | Tests: 27 (engine, memory store, Redis store, auth) | Redis suite runs with `REDIS_TEST_URL` |

## Milestone 3 — Feels alive ⬜

| Status | Task |
|---|---|
| ⬜ | Watcher count ("1,204 watching") |
| ⬜ | Sound + vibration on outbid (opt‑in) |
| ⬜ | Simulated bidders for demo auctions |
| ⬜ | Item images (upload) |

## Milestone 4 — Real users ⬜

| Status | Task |
|---|---|
| ⬜ | Production auth: email verification, password reset, login rate limiting, session revocation |
| ⬜ | Sellers cannot bid on their own auctions; show "Listed by" |
| ⬜ | "My bids" and "Watching" pages |
| ⬜ | Reserve price |
| ⬜ | Proxy bidding (set a max, the system bids for you) |
| ⬜ | Rate limiting per bidder |

## Milestone 5 — Scale ⬜

| Status | Task |
|---|---|
| ⬜ | Dedicated WebSocket fan‑out tier (see Architecture → Scaling path) |
| ⬜ | Per‑auction single‑writer (sharded by auction id) |
| ⬜ | Load test: 300k watchers, 5k bids/s on one auction |
| ⬜ | Durable bid ledger (Postgres) + audit export |
