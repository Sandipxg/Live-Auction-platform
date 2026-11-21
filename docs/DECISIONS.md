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
**Decision.** SSE (`text/event-stream`). Each stream lives 50 s, then the browser's `EventSource` reconnects automatically (`retry: 1000`). Updates are **pushed** via Redis pub/sub (see D13); a 2 s version check is only a safety net.
**Trade‑off.** One SSE connection per watcher on serverless functions is fine for a prototype, not for 300k watchers. Documented upgrade: dedicated WebSocket gateways ([ARCHITECTURE.md → Scaling path](ARCHITECTURE.md#scaling-path)).

## D7 — Idempotent bids

**Context.** Networks fail most when it matters: the final seconds on a phone. Users tap again.
**Decision.** The browser generates a `bidId` and reuses it on retry. The server records seen ids per auction and returns the original result for a duplicate.

## D8 — No authentication in v0.1 *(superseded by D12 in v0.2)*

**Context.** The first goal is a correct, easy‑to‑use core.
**Decision.** A visitor picked a display name; a random id was stored in `localStorage` and trusted by the server.
**Trade‑off.** Anyone could impersonate a name — replaced by real accounts in D12.

## D9 — In‑memory fallback store

**Context.** Contributors should be able to run `npm run dev` with zero setup.
**Decision.** Without Redis credentials, the app uses an in‑process store with push notifications. Same interface, same engine, same tests.
**Trade‑off.** On a multi‑instance host (Vercel) the memory store is per instance, so two visitors could land on different instances and see different auctions. Production must set Redis credentials.

## D10 — Money as integer rupees

**Decision.** All amounts are whole numbers (₹). No floating point anywhere in the bid path.

## D11 — Plain CSS with tokens (no Tailwind)

**Decision.** One stylesheet; every colour, size, space and duration is a CSS custom property documented in [CONTEXT.md](CONTEXT.md). Fewer dependencies, dark mode for free by redefining tokens.

## D12 — Demo authentication: accounts + signed session cookie (v0.2)

**Context.** Users must log in before they bid or start an auction. Watching stays open to everyone — the brief is about hundreds of thousands of *watchers*.
**Decision.**
- Username + password accounts stored in Redis (`user:{username}`, created with `SET NX` so names are unique atomically).
- Passwords hashed with **scrypt** and a per‑user random salt; never stored or logged in plain text.
- Session = HMAC‑SHA256‑signed cookie (`lb_session`): `httpOnly`, `SameSite=Lax`, `Secure` in production, 7‑day expiry. Stateless — no session table. Secret from `AUTH_SECRET`.
- **The server takes the bidder's identity from the cookie only.** Any `bidderId`/`bidderName` in a request body is ignored (tested: a forged body is still recorded as the real user).
- Three shared demo accounts (Alice, Bob, Priya — password `demo1234`) for one‑tap testing; created on first use.
- `?next=` redirects accept only same‑site relative paths.
**Trade‑off.** "Demo‑grade": no email verification, password reset, rate limiting on login, or session revocation (logout clears the cookie, but a copied token stays valid until it expires). All listed in Tasks for a production version.

## D13 — Redis over TCP (ioredis) with pub/sub push, replacing Upstash REST polling (v0.2)

**Context.** The project's Redis is a Redis Cloud database attached through the Vercel Marketplace (`REDIS_URL`, TLS). It speaks the normal Redis protocol, which also unlocks pub/sub.
**Decision.** `ioredis` with one connection per server instance. The bid‑commit Lua script now ends with `PUBLISH auc:{id}:events <version>`. Each instance holds **one** subscriber connection shared by all its watchers, so a bid accepted on instance A reaches watchers on instance B in tens of milliseconds (measured 69–77 ms locally across two instances).
**Trade‑off.** Long‑lived TCP connections from serverless functions; fine at prototype scale. The REST client was removed — the in‑memory store remains for zero‑setup local dev.
