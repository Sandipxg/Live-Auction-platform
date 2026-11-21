"use client";
import { useCallback, useEffect, useState } from "react";

/* ---------- Identity (no auth yet: a name + random id kept in this browser) ---------- */

export interface Identity {
  id: string;
  name: string;
}

const ID_KEY = "livebid.identity";

function readIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(ID_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  useEffect(() => setIdentity(readIdentity()), []);
  const save = useCallback((name: string) => {
    const next = { id: readIdentity()?.id ?? crypto.randomUUID(), name: name.trim().slice(0, 24) };
    try {
      localStorage.setItem(ID_KEY, JSON.stringify(next));
    } catch {}
    setIdentity(next);
    return next;
  }, []);
  return { identity, save };
}

/* ---------- Server clock: every countdown runs on server time, not the device's ---------- */

let clockOffset = 0;

/** Call with each `serverNow` received from the API to keep the offset fresh. */
export function syncClock(serverNow: number) {
  clockOffset = serverNow - Date.now();
}

export function serverTime() {
  return Date.now() + clockOffset;
}

/**
 * Re-renders every `intervalMs` and returns the current server time.
 * `initial` makes the first render identical on server and client (no hydration mismatch).
 */
export function useServerNow(intervalMs = 200, initial?: number) {
  const [now, setNow] = useState(() => initial ?? serverTime());
  useEffect(() => {
    setNow(serverTime());
    const t = setInterval(() => setNow(serverTime()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
