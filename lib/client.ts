"use client";
import { useEffect, useState } from "react";

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
