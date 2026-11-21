# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict) | One codebase for UI and API; first‑class on Vercel |
| Live updates | **Server‑Sent Events** (`EventSource`) | One‑way server→browser push over plain HTTP; auto‑reconnect built in; works on serverless |
| State (production) | **Redis** (Redis Cloud via Vercel Marketplace) with **ioredis** | Atomic Lua scripts, a single authoritative clock (`TIME`), pub/sub to push bids across instances |
| Auth | Username/password, **scrypt** hashes, **HMAC‑signed httpOnly cookie** | Stateless sessions; no extra service ([D12](DECISIONS.md)) |
| State (local) | In‑memory store | Zero setup: `npm run dev` just works |
| Styling | Plain CSS with design tokens | No build plugins; every value documented in [CONTEXT.md](CONTEXT.md) |
| Tests | **Vitest** | Fast, TypeScript‑native |
| Hosting | **Vercel** | |

## System overview

```mermaid
flowchart LR
  subgraph Browser["Browser · every watcher"]
    direction TB
    UI["Auction room<br/>(React)"]
    ES["EventSource"]
  end
  subgraph Vercel["Vercel functions · many instances"]
    direction TB
    API["POST /bids"]
    ENG["engine.ts<br/>pure rules"]
    SSE["GET /stream<br/>SSE"]
  end
  R[("Redis<br/>auction + version · last 50 bids<br/>seen bid ids · users<br/>TIME = the one clock")]

  UI -- "① place bid (session cookie)" --> API
  API -- "② decide" --> ENG
  API -- "③ atomic compare-and-set + PUBLISH" --> R
  R -- "④ pub/sub: new version" --> SSE
  SSE -- "⑤ push snapshot" --> ES
  ES --> UI
```

Without `REDIS_URL` the same code uses the in‑memory store and pushes updates through an in‑process event emitter.

## Placing a bid

```mermaid
sequenceDiagram
  autonumber
  participant U as Bidder (browser)
  participant F as Vercel function
  participant E as engine.decideBid
  participant R as Redis

  U->>F: POST /api/auctions/:id/bids {bidId, amount} + session cookie
  F->>F: verify cookie signature → bidder = session user
  alt no valid session
    F-->>U: 401 Log in to bid
  end
  loop until committed or rejected (max 12)
    F->>R: GET auction, TIME
    F->>E: decideBid(auction, bid, now)
    alt rule violated
      E-->>F: BID_TOO_LOW / CLOSED / ALREADY_LEADING
      F-->>U: 409 + minNextBid
    else accepted
      E-->>F: next auction state (version+1, maybe endsAt = now+10s)
      F->>R: EVAL commit(expectedVersion, next, bid)
      Note over R: atomic: version unchanged?<br/>TIME < endsAt?<br/>bidId unseen?<br/>then PUBLISH new version
      alt OK
        R-->>F: OK
        F-->>U: 200 {auction, bid}
      else CONFLICT (someone else won the race)
        R-->>F: CONFLICT → re-read and re-decide
      else CLOSED
        R-->>F: CLOSED
        F-->>U: 409 auction closed
      end
    end
  end
```

## Auction lifecycle

```mermaid
stateDiagram-v2
  [*] --> Live: created (endsAt = now + duration)
  Live --> Closing: < 30 s left
  Closing --> Closing: bid with < 10 s left<br/>endsAt = now + 10 s
  Closing --> Closed: now ≥ endsAt
  Live --> Closed: now ≥ endsAt (no late bids)
  Closed --> [*]: winner = leader at endsAt
```

Status is **derived from time** (`statusOf(auction, now)`), never stored. There is no "close job" that could run late or disagree with the bid path.

## What a watcher sees

```mermaid
flowchart TD
  L["Open auction page<br/>(server-rendered snapshot)"] --> C["syncClock(serverNow)"]
  C --> S["Open EventSource /stream"]
  S --> E{"event"}
  E -- snapshot --> V{"version ≥ shown?"}
  V -- yes --> R["Render price, leader, history<br/>flash price · show '+10s' if endsAt moved"]
  V -- no --> D["Drop (stale)"]
  E -- ping --> C
  E -- "stream ended (50 s)" --> S
```

The countdown runs on **server time** (`Date.now() + offset`), so every device shows the same seconds remaining.

## Folder layout

```
.
├── app/                         Next.js App Router
│   ├── page.tsx                 Lobby (open / ended auctions)
│   ├── auctions/[id]/page.tsx   Auction room (server-rendered first snapshot)
│   ├── new/page.tsx             Create an auction (login required)
│   ├── login/page.tsx           Log in · sign up · demo accounts
│   ├── api/auth/                login · signup · logout
│   ├── api/auctions/
│   │   ├── route.ts             GET list · POST create
│   │   └── [id]/
│   │       ├── route.ts         GET snapshot
│   │       ├── bids/route.ts    POST bid
│   │       └── stream/route.ts  GET live stream (SSE)
│   ├── layout.tsx · globals.css Shell + design tokens
│   └── not-found.tsx
├── components/                  Lobby, AuctionRoom, LoginForm, UserMenu, NewAuctionForm, Tile, StatusPill
├── lib/
│   ├── engine.ts                ★ The rules. Pure functions, no I/O, fully tested
│   ├── auth.ts                  Password hashing, signed sessions, accounts
│   ├── types.ts                 Auction, Bid, results
│   ├── store/
│   │   ├── types.ts             AuctionStore interface
│   │   ├── memory.ts            Local / fallback store
│   │   ├── redis.ts             Production store (Lua compare-and-set + pub/sub)
│   │   └── index.ts             Picks Redis if configured
│   ├── demo.ts                  Keeps demo inventory topped up
│   ├── client.ts                Browser: server clock
│   └── format.ts                ₹ and countdown formatting
├── tests/                       Vitest: rules, concurrency, idempotency, Redis store, auth
└── docs/                        Aim · Tasks · Context · Architecture · Decisions · Scaling
```

## API

🔒 = requires the session cookie.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/auth/signup` | `{ username, password, displayName? }` | `201 { user }` + cookie |
| `POST` | `/api/auth/login` | `{ username, password }` | `{ user }` + cookie · `401` |
| `POST` | `/api/auth/logout` | — | clears cookie |
| `GET` | `/api/auctions` | — | `{ auctions, serverNow, store }` |
| `POST` 🔒 | `/api/auctions` | `{ title, description?, startingPrice, minIncrement, durationMinutes }` | `201 { auction }` · `401` |
| `GET` | `/api/auctions/:id` | — | `{ auction, bids, serverNow }` |
| `POST` 🔒 | `/api/auctions/:id/bids` | `{ bidId, amount }` | `200 { ok, auction, bid }` · `409 { reason, minNextBid }` · `401` |
| `GET` | `/api/auctions/:id/stream` | — | `text/event-stream`: `snapshot`, `ping` |

## Scaling path

> Full design with load model, capacity numbers, latency budget and failure modes: **[SCALING.md](SCALING.md)**.

The prototype is correct at any scale; it is not yet *efficient* at the target scale (300k watchers on one auction). The upgrade path keeps the same rules engine and the same guarantees:

```mermaid
flowchart LR
  subgraph Edge["Fan-out tier (stateless, horizontally scaled)"]
    G1["WS gateway 1<br/>~50k sockets"]
    G2["WS gateway 2"]
    Gn["WS gateway n"]
  end
  subgraph Core["Bid tier"]
    W["Auction writer<br/>(one owner per auction,<br/>sharded by id)"]
  end
  PS[("Redis pub/sub<br/>or NATS")]
  DB[("Postgres<br/>bid ledger")]

  Bidders -- bids --> W
  W -- "accepted bid<br/>(version n)" --> PS
  W -- append --> DB
  PS --> G1 & G2 & Gn
  G1 & G2 & Gn -- "coalesced snapshot<br/>≤ 10 / s" --> Watchers
```

1. **Dedicated fan‑out.** Bids are already pushed by pub/sub (one message per accepted bid). Move the watcher connections off serverless functions onto WebSocket gateways that each hold ~50k sockets.
2. **Coalesce.** During the final‑seconds storm, gateways send at most ~10 snapshots/s per auction; each carries the latest version, so nothing is lost.
3. **Single writer per auction.** Route all bids for an auction to one owner (consistent hashing). Bids become a local, in‑order operation — no compare‑and‑set retries under contention.
4. **Durable ledger.** Every accepted bid appended to Postgres for audit and dispute resolution.
