"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { statusOf } from "@/lib/engine";
import { countdown, money } from "@/lib/format";
import { syncClock, useServerNow } from "@/lib/client";
import type { Auction } from "@/lib/types";
import { StatusPill } from "./StatusPill";
import { Tile } from "./Tile";

const REFRESH_MS = 2000;

export function Lobby() {
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"open" | "ended">("open");
  const now = useServerNow(250);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/auctions", { cache: "no-store" });
        const data = (await res.json()) as { auctions: Auction[]; serverNow: number };
        if (!alive) return;
        syncClock(data.serverNow);
        setAuctions(data.auctions);
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const { open, ended } = useMemo(() => {
    const list = auctions ?? [];
    const open = list.filter((a) => a.endsAt > now).sort((a, b) => a.endsAt - b.endsAt);
    const ended = list.filter((a) => a.endsAt <= now).sort((a, b) => b.endsAt - a.endsAt);
    return { open, ended };
  }, [auctions, now]);

  const shown = tab === "open" ? open : ended;

  return (
    <section>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "open"} className={tab === "open" ? "on" : ""} onClick={() => setTab("open")}>
          Open now <span className="count">{open.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "ended"} className={tab === "ended" ? "on" : ""} onClick={() => setTab("ended")}>
          Ended <span className="count">{ended.length}</span>
        </button>
        {error && <span className="muted small conn-warn">Reconnecting…</span>}
      </div>

      {auctions === null ? (
        <div className="grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card skeleton" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>{tab === "open" ? "No auctions are open right now." : "Nothing has ended yet."}</p>
          <Link href="/new" className="btn btn-ink">
            Start an auction
          </Link>
        </div>
      ) : (
        <div className="grid">
          {shown.map((a) => (
            <AuctionCard key={a.id} auction={a} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

function AuctionCard({ auction: a, now }: { auction: Auction; now: number }) {
  const status = statusOf(a, now);
  const left = a.endsAt - now;
  return (
    <Link href={`/auctions/${a.id}`} className={`card card-${status}`}>
      <Tile title={a.title} hue={a.hue} />
      <div className="card-body">
        <div className="card-top">
          <StatusPill status={status} />
          <span className={`clock ${left <= 10_000 && left > 0 ? "urgent" : ""}`}>
            {status === "closed" ? "Ended" : countdown(left)}
          </span>
        </div>
        <h3 className="card-title">{a.title}</h3>
        <div className="card-price">
          <span className="label">{status === "closed" ? (a.bidCount ? "Sold for" : "No bids") : a.bidCount ? "Current bid" : "Starts at"}</span>
          <span className="price" key={a.version}>
            {money(a.currentPrice)}
          </span>
        </div>
        <div className="card-meta">
          {a.bidCount} {a.bidCount === 1 ? "bid" : "bids"}
          {a.leaderName && <> · {status === "closed" ? "won by" : "led by"} <strong>{a.leaderName}</strong></>}
        </div>
      </div>
    </Link>
  );
}
