# Aim

> **We are building a platform for live auctions.** Thousands of auctions run at the same time. A popular one can have hundreds of thousands of people watching, and most of its bids arrive in the final ten seconds.
>
> Every watcher must see the current price almost immediately, and when an auction closes there can be no doubt about who won. A late bid extends the auction, so nobody wins by bidding in the last instant.

## Definition of done

The product is done when every statement below is true and demonstrably tested.

### Correctness — "no doubt about who won"

| # | Requirement | How it is met | Proof |
|---|---|---|---|
| C1 | Two bids can never both be accepted at the same price step. | Every bid commits through an atomic compare‑and‑set on the auction's `version`. | `tests/memory-store.test.ts` — 200 simultaneous bids, exactly 1 accepted |
| C2 | No bid is ever accepted at or after the close time. | The commit checks the close time against a **single clock** (Redis `TIME`), inside the same atomic step. | `tests/engine.test.ts` — "rejects every bid at or after the close time" |
| C3 | The winner is the leader at the close instant — no separate "closing job" can disagree. | Closing is a pure consequence of time; there is no mutable "closed" flag to race against. | Design: [DECISIONS.md#d4](DECISIONS.md) |
| C4 | Retrying a bid (flaky network in the last seconds) never places it twice. | Client sends a `bidId`; the server remembers ids per auction. | `tests/memory-store.test.ts` — idempotency |

### Fairness — "nobody wins by bidding in the last instant"

| # | Requirement | Proof |
|---|---|---|
| F1 | A bid placed with less than 10 s left resets the clock to 10 s. | `tests/engine.test.ts` — "extends the clock" |
| F2 | The auction ends only after 10 quiet seconds. | `tests/engine.test.ts` — "keeps extending through a bidding war" |
| F3 | Every watcher is told when the clock was extended. | UI: "Late bid · clock reset to 0:10", `+10s` tag in history |

### Freshness — "see the current price almost immediately"

| # | Requirement | Target (prototype) | Target (production) |
|---|---|---|---|
| L1 | Price visible to all watchers after a bid is accepted | < 500 ms | < 250 ms p99 |
| L2 | Countdown agrees across devices | Within network RTT (server clock offset applied) | Same |
| L3 | Watchers never see the price go backwards | Versioned snapshots; older versions dropped | Same |

### Identity (v0.2)

| # | Requirement | Proof |
|---|---|---|
| A1 | Anyone can watch; only logged‑in users can bid or start an auction. | API returns `401` without a session; UI shows "Log in to bid" |
| A2 | A bid is always recorded under the logged‑in user — the browser cannot claim to be someone else. | E2E test: forged `bidderName` in body is ignored |
| A3 | Passwords are never stored in plain text; sessions cannot be forged. | `tests/auth.test.ts` — scrypt, tampered/expired tokens rejected |

### Usability

- A first-time visitor can place a bid in **under 10 seconds**: tap a demo account, tap one button.
- Works on a 360 px phone and on desktop; respects reduced‑motion and dark mode.
- Every rejection tells the user what to do next ("Next bid: ₹1,300").

### Scale (production target, not prototype)

- 10,000 concurrent auctions; 300,000 watchers on one auction; 5,000 bids/s on one auction during the final seconds.
- The path to get there is in [ARCHITECTURE.md → Scaling path](ARCHITECTURE.md#scaling-path).

## Out of scope for now

Payments, password reset / email verification, reserve prices, proxy (automatic) bidding, images uploads, moderation. Tracked in [TASKS.md](TASKS.md).
