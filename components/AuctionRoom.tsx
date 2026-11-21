"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { minNextBid, SNIPE_WINDOW_MS, statusOf } from "@/lib/engine";
import { countdown, money, timeAgo } from "@/lib/format";
import { syncClock, useServerNow } from "@/lib/client";
import type { AuctionSnapshot, BidResult, SessionUser } from "@/lib/types";
import { StatusPill } from "./StatusPill";
import { Tile } from "./Tile";

type Conn = "connecting" | "live" | "reconnecting";
type Notice = { kind: "ok" | "warn" | "info"; text: string } | null;

export function AuctionRoom({ initial, user }: { initial: AuctionSnapshot; user: SessionUser | null }) {
  const [snap, setSnap] = useState(initial);
  const [conn, setConn] = useState<Conn>("connecting");
  const [extendedAt, setExtendedAt] = useState(0);
  const now = useServerNow(100, initial.serverNow);
  const a = snap.auction;
  const id = a.id;

  // Only ever move forward: drop any update older than what we already show.
  const accept = useCallback((next: AuctionSnapshot) => {
    syncClock(next.serverNow);
    setSnap((cur) => {
      if (next.auction.version < cur.auction.version) return cur;
      if (next.auction.endsAt > cur.auction.endsAt && next.auction.extensions > cur.auction.extensions) setExtendedAt(Date.now());
      return next;
    });
  }, []);

  useEffect(() => {
    syncClock(initial.serverNow);
    const es = new EventSource(`/api/auctions/${id}/stream`);
    es.addEventListener("open", () => setConn("live"));
    es.addEventListener("error", () => setConn("reconnecting"));
    es.addEventListener("snapshot", (e) => {
      setConn("live");
      accept(JSON.parse((e as MessageEvent).data));
    });
    es.addEventListener("ping", (e) => syncClock(JSON.parse((e as MessageEvent).data).serverNow));
    return () => es.close();
  }, [id, initial.serverNow, accept]);

  const status = statusOf(a, now);
  const left = Math.max(0, a.endsAt - now);
  const urgent = status !== "closed" && left <= SNIPE_WINDOW_MS;
  const showExtended = Date.now() - extendedAt < 2500;

  return (
    <div className="room">
      <Link href="/" className="back">
        ← All auctions
      </Link>

      <div className="room-grid">
        <section className="room-main">
          <div className="room-head">
            <Tile title={a.title} hue={a.hue} size="lg" />
            <div>
              <div className="row gap-8">
                <StatusPill status={status} />
                <span className={`conn conn-${conn}`}>
                  <span className="dot" aria-hidden />
                  {conn === "live" ? "Live updates" : conn === "connecting" ? "Connecting…" : "Reconnecting…"}
                </span>
              </div>
              <h1 className="room-title">{a.title}</h1>
              {a.description && <p className="muted">{a.description}</p>}
            </div>
          </div>

          <div className={`price-panel ${status}`}>
            <div>
              <div className="label">{status === "closed" ? (a.bidCount ? "Winning bid" : "Closed") : a.bidCount ? "Current bid" : "Starting price"}</div>
              <div className="big-price" key={a.version}>
                {money(a.currentPrice)}
              </div>
              <div className="muted small">
                {a.leaderName ? (
                  <>
                    {status === "closed" ? "Won by" : "Leading:"} <strong>{a.leaderName}</strong> · {a.bidCount} {a.bidCount === 1 ? "bid" : "bids"}
                  </>
                ) : (
                  "No bids yet"
                )}
              </div>
            </div>
            <div className="clock-box">
              <div className="label">{status === "closed" ? "Ended" : "Time left"}</div>
              <div className={`big-clock ${urgent ? "urgent" : ""}`}>{status === "closed" ? "0:00" : countdown(left)}</div>
              <div className={`extended ${showExtended ? "show" : ""}`} aria-live="polite">
                {showExtended ? "Late bid · clock reset to 0:10" : a.extensions > 0 ? `Extended ${a.extensions}×` : " "}
              </div>
            </div>
          </div>

          {status === "closed" ? (
            <ResultBanner snap={snap} user={user} />
          ) : user ? (
            <BidPanel snap={snap} user={user} onResult={accept} />
          ) : (
            <LoginPrompt auctionId={a.id} />
          )}

          <div className="rule">
            <strong>Fair finish.</strong> Any bid placed with less than 10 seconds left resets the clock to 10 seconds. The
            auction only ends after 10 quiet seconds, and the top bid at that moment wins.
          </div>
        </section>

        <aside className="room-side">
          <h2 className="side-title">Bid history</h2>
          {snap.bids.length === 0 ? (
            <p className="muted small">Bids will appear here the instant they are placed.</p>
          ) : (
            <ol className="history">
              {snap.bids.map((b, i) => (
                <li key={b.id} className={i === 0 ? "top" : ""}>
                  <div>
                    <strong>{b.bidderName}</strong>
                    <span className="muted small"> · {timeAgo(now - b.at)}</span>
                    {b.extended && <span className="tag">+10s</span>}
                  </div>
                  <span className="amount">{money(b.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

function LoginPrompt({ auctionId }: { auctionId: string }) {
  return (
    <div className="bid-panel login-prompt">
      <div>
        <strong>Log in to bid</strong>
        <div className="muted small">You can watch freely. Bidding needs an account — or one tap with a demo account.</div>
      </div>
      <Link href={`/login?next=${encodeURIComponent(`/auctions/${auctionId}`)}`} className="btn btn-accent btn-lg">
        Log in to bid
      </Link>
    </div>
  );
}

function ResultBanner({ snap, user }: { snap: AuctionSnapshot; user: SessionUser | null }) {
  const a = snap.auction;
  if (!a.leaderId) return <div className="result none">This auction closed without any bids.</div>;
  const mine = user?.id === a.leaderId;
  return (
    <div className={`result ${mine ? "mine" : ""}`}>
      <div className="result-title">{mine ? "You won this auction" : `Sold to ${a.leaderName}`}</div>
      <div className="muted">
        Final price {money(a.currentPrice)} after {a.bidCount} {a.bidCount === 1 ? "bid" : "bids"}. No further bids are
        accepted.
      </div>
    </div>
  );
}

function BidPanel({ snap, user, onResult }: { snap: AuctionSnapshot; user: SessionUser; onResult: (s: AuctionSnapshot) => void }) {
  const a = snap.auction;
  const min = minNextBid(a);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const leading = a.leaderId === user.id;
  const pendingId = useRef<string | null>(null);
  const wasLeading = useRef(leading);

  // Tell the bidder the instant they lose the lead.
  useEffect(() => {
    if (wasLeading.current && !leading && a.leaderName) {
      setNotice({ kind: "warn", text: `You've been outbid — ${a.leaderName} now leads at ${money(a.currentPrice)}.` });
    }
    wasLeading.current = leading;
  }, [leading, a.leaderName, a.currentPrice]);

  // Keep the custom amount valid as the price moves.
  useEffect(() => {
    setCustom((c) => (c && Number(c) >= min ? c : ""));
  }, [min]);

  const place = async (amount: number) => {
    setBusy(true);
    setNotice(null);
    // Same id on retry → the server never counts it twice.
    const bidId = (pendingId.current ??= crypto.randomUUID());
    try {
      const res = await fetch(`/api/auctions/${a.id}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidId, amount }),
      });
      const r = (await res.json()) as BidResult;
      pendingId.current = null;
      if (r.ok) {
        onResult({ auction: r.auction, bids: [r.bid, ...snap.bids.filter((b) => b.id !== r.bid.id)], serverNow: r.serverNow });
        setNotice({ kind: "ok", text: r.bid.extended ? `You lead at ${money(r.bid.amount)} — clock reset to 10s.` : `You lead at ${money(r.bid.amount)}.` });
        setCustom("");
      } else {
        const text = r.minNextBid && r.reason === "BID_TOO_LOW" ? `${r.message} Next bid: ${money(r.minNextBid)}.` : r.message;
        setNotice({ kind: "warn", text });
      }
    } catch {
      setNotice({ kind: "warn", text: "Network problem — tap again to retry the same bid safely." });
    } finally {
      setBusy(false);
    }
  };

  const quick = [min, min + a.minIncrement * 2, min + a.minIncrement * 5];
  const customNum = Number(custom);
  const customValid = Number.isInteger(customNum) && customNum >= min;

  return (
    <div className="bid-panel">
      {leading ? (
        <div className="leading">
          <span className="dot" aria-hidden /> You hold the top bid, {user.displayName}. We&apos;ll show it here the moment
          someone outbids you.
        </div>
      ) : (
        <>
          <div className="quick">
            {quick.map((amt, i) => (
              <button key={i} className={`btn ${i === 0 ? "btn-accent" : "btn-ghost"} btn-lg`} disabled={busy} onClick={() => place(amt)}>
                {i === 0 ? "Bid " : ""}
                {money(amt)}
              </button>
            ))}
          </div>
          <form
            className="custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (customValid) place(customNum);
            }}
          >
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={`${min} or more`}
              aria-label="Custom bid amount"
            />
            <button className="btn btn-ink" disabled={busy || !customValid}>
              Place bid
            </button>
          </form>
        </>
      )}
      <div className="muted small">
        Minimum next bid {money(min)} · increments of {money(a.minIncrement)}
        {" "}
        · bidding as <strong>{user.displayName}</strong>
      </div>
      {notice && !(leading && notice.kind === "ok") && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    </div>
  );
}
