"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money } from "@/lib/format";

const DURATIONS = [
  { label: "2 min", value: 2 },
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "1 hour", value: 60 },
];

export default function NewAuction() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingPrice, setStartingPrice] = useState("1000");
  const [minIncrement, setMinIncrement] = useState("100");
  const [durationMinutes, setDuration] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          startingPrice: Number(startingPrice),
          minIncrement: Number(minIncrement),
          durationMinutes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the auction.");
      router.push(`/auctions/${data.auction.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const digits = (v: string) => v.replace(/[^0-9]/g, "");

  return (
    <div className="form-page">
      <h1>Start an auction</h1>
      <p className="muted">It goes live the moment you create it. Share the link and watch the bids arrive.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Item</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you selling?" maxLength={80} required minLength={3} />
        </label>
        <label className="field">
          <span>
            Description <em className="muted">optional</em>
          </span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={400} placeholder="Condition, size, pickup…" />
        </label>
        <div className="two">
          <label className="field">
            <span>Starting price (₹)</span>
            <input inputMode="numeric" value={startingPrice} onChange={(e) => setStartingPrice(digits(e.target.value))} required />
          </label>
          <label className="field">
            <span>Minimum increment (₹)</span>
            <input inputMode="numeric" value={minIncrement} onChange={(e) => setMinIncrement(digits(e.target.value))} required />
          </label>
        </div>
        <fieldset className="field">
          <span>Runs for</span>
          <div className="seg">
            {DURATIONS.map((d) => (
              <button type="button" key={d.value} className={durationMinutes === d.value ? "on" : ""} onClick={() => setDuration(d.value)}>
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="muted small">
          Opens at {startingPrice ? money(Number(startingPrice)) : "—"}; each bid must beat the last by at least{" "}
          {minIncrement ? money(Number(minIncrement)) : "—"}. Bids in the final 10 seconds extend the clock.
        </p>
        {error && <div className="notice warn">{error}</div>}
        <button className="btn btn-accent btn-lg" disabled={busy}>
          {busy ? "Creating…" : "Start auction"}
        </button>
      </form>
    </div>
  );
}
