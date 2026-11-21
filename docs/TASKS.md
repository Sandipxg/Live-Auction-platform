# Tasks — live progress tracker

Legend: ✅ done · 🟡 in progress · ⬜ planned

_Last updated: 2026-11-21_

## Milestone 1 — Simple, correct core (v0.1) ✅

| Status | Task | Notes |
|---|---|---|
| ✅ | Project scaffold (Next.js 15, TypeScript, Vitest) | |
| ✅ | Pure auction rules engine (`lib/engine.ts`) | Bid validation, increments, anti‑snipe, status |
| ✅ | In‑memory store (local dev) | Single process ⇒ naturally atomic |
| ✅ | Redis store with atomic compare‑and‑set (Lua) | One clock (Redis `TIME`) decides the close |
| ✅ | Idempotent bids (`bidId`) | Safe retries in the final seconds |
| ✅ | REST API: list, create, snapshot, bid | |
| ✅ | Live updates over Server‑Sent Events | Push (memory) / 300 ms version poll (Redis) |
| ✅ | Server‑synced countdown | Clients apply server clock offset |
| ✅ | Lobby with live prices and countdowns | Open / Ended tabs |
| ✅ | Auction room: price, clock, bid panel, history, winner banner | Outbid alert, extension notice |
| ✅ | Create auction form | |
| ✅ | Self‑refilling demo inventory | Keeps ≥ 6 auctions open on the public demo |
| ✅ | Unit tests (14) | Engine rules + concurrency + idempotency |
| ✅ | Docs: Aim, Tasks, Context, Architecture, Decisions; README with diagrams | |
| ✅ | Deploy to Vercel | https://live-auction-platform-alpha.vercel.app |

## Milestone 2 — Feels alive ⬜

| Status | Task |
|---|---|
| 🟡 | Connect Upstash Redis on Vercel (shared state across all instances) — live demo currently on the in-memory fallback |
| ⬜ | Watcher count ("1,204 watching") |
| ⬜ | Sound + vibration on outbid (opt‑in) |
| ⬜ | Simulated bidders for demo auctions |
| ⬜ | Item images (upload) |

## Milestone 3 — Real users ⬜

| Status | Task |
|---|---|
| ⬜ | Authentication (sign in to bid; display names unique) |
| ⬜ | "My bids" and "Watching" pages |
| ⬜ | Reserve price |
| ⬜ | Proxy bidding (set a max, the system bids for you) |
| ⬜ | Rate limiting per bidder |

## Milestone 4 — Scale ⬜

| Status | Task |
|---|---|
| ⬜ | Dedicated WebSocket fan‑out tier (see Architecture → Scaling path) |
| ⬜ | Per‑auction single‑writer (sharded by auction id) |
| ⬜ | Load test: 300k watchers, 5k bids/s on one auction |
| ⬜ | Durable bid ledger (Postgres) + audit export |
