# Decisions

Architecture decision records, newest last. Each states the context, the decision, and what we gave up.

---

## D1 — Rules live in one pure module

**Context.** The bid rules (minimum increment, close time, anti‑snipe) decide who wins. If they are duplicated across stores or the UI, they will drift.
**Decision.** `lib/engine.ts` holds every rule as pure functions that take `now` as an argument. Stores call it; the UI imports it to show "minimum next bid" and status.
**Trade‑off.** The Redis store does a read → decide → conditional‑write round trip instead of doing everything in Lua. Accepted: the rules stay testable TypeScript.

## D2 — Optimistic concurrency (compare‑and‑set on `version`)

**Context.** In the last seconds many bids race for the same price step. Exactly one may win.
**Decision.** Every auction carries a `version`. A bid commits only if the version is unchanged since it was read (atomic Lua script). On conflict the server re‑reads and re‑decides (up to 12 times, with jitter) — usually the bid is then simply "too low" and the user is told the new minimum.
**Trade‑off.** Under extreme contention, retries cost round trips. The scaling path (single writer per auction) removes them. Locks were rejected: a crashed holder in the final seconds would freeze an auction.

## D3 — One clock decides the close

**Context.** Serverless instances have slightly different clocks. If instance A thinks there are 50 ms left and instance B thinks the auction closed, the winner is in doubt.
**Decision.** In production every decision uses Redis `TIME`, and the commit script re‑checks `TIME < endsAt` atomically. Clients receive `serverNow` with every message and run their countdown on server time.
**Trade‑off.** One extra round trip per bid to read the time. Accepted.

## D4 — "Closed" is derived from time, not stored

**Context.** A background job that flips `status = closed` can run late, run twice, or race a final bid.
**Decision.** There is no status field. `statusOf(auction, now)` is `closed` once `now ≥ endsAt`, and `decideBid` rejects everything from that instant. The leader at that moment is, by construction, the winner.
**Trade‑off.** Side effects on close (emails, payment) will need a separate idempotent job later; it can read the result but never change it.

## D5 — Anti‑sniping: reset to 10 seconds, not "add 10 seconds"

**Context.** The brief: "A late bid extends the auction, so nobody wins by bidding in the last instant."
**Decision.** A bid with less than 10 s remaining sets `endsAt = now + 10 s`. The auction ends only after 10 quiet seconds. Every extension is counted and shown.
**Trade‑off.** A bidding war can run past the scheduled end indefinitely — that is the point. Adding a fixed +10 s per bid was rejected: it lets the clock balloon unpredictably during a burst.

## D6 — Server‑Sent Events for live updates

**Context.** Watchers only *receive* updates; bids go over normal HTTP POST. Vercel functions do not host WebSocket servers.
**Decision.** SSE (`text/event-stream`). Each stream lives 50 s, then the browser's `EventSource` reconnects automatically (`retry: 1000`). With Redis, the function checks the auction version every 300 ms and pushes only on change.
**Trade‑off.** Polling Redis per watcher does not scale to 300k watchers. Documented upgrade: WebSocket gateways + pub/sub ([ARCHITECTURE.md → Scaling path](ARCHITECTURE.md#scaling-path)).

## D7 — Idempotent bids

**Context.** Networks fail most when it matters: the final seconds on a phone. Users tap again.
**Decision.** The browser generates a `bidId` and reuses it on retry. The server records seen ids per auction and returns the original result for a duplicate.

## D8 — No authentication in v0.1

**Context.** The first goal is a correct, easy‑to‑use core.
**Decision.** A visitor picks a display name; a random id is stored in `localStorage`. The server trusts it.
**Trade‑off.** Anyone can impersonate a name. Fine for a prototype; Milestone 3 adds auth.

## D9 — In‑memory fallback store

**Context.** Contributors should be able to run `npm run dev` with zero setup.
**Decision.** Without Redis credentials, the app uses an in‑process store with push notifications. Same interface, same engine, same tests.
**Trade‑off.** On a multi‑instance host (Vercel) the memory store is per instance, so two visitors could land on different instances and see different auctions. Production must set Redis credentials.

## D10 — Money as integer rupees

**Decision.** All amounts are whole numbers (₹). No floating point anywhere in the bid path.

## D11 — Plain CSS with tokens (no Tailwind)

**Decision.** One stylesheet; every colour, size, space and duration is a CSS custom property documented in [CONTEXT.md](CONTEXT.md). Fewer dependencies, dark mode for free by redefining tokens.
