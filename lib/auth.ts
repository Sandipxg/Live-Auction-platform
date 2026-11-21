/**
 * Demo authentication: username + password, no email.
 *
 * - Passwords are hashed with scrypt and a per-user random salt.
 * - The session is a signed (HMAC-SHA256) cookie: httpOnly, SameSite=Lax,
 *   Secure in production. No session table — the signature is the proof.
 * - Bids and new auctions take the bidder's identity from this cookie only;
 *   anything the browser sends about "who I am" is ignored.
 */
import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { newId } from "./engine";
import type { AuctionStore } from "./store";
import type { SessionUser, User } from "./types";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "lb_session";
const SESSION_TTL_S = 7 * 24 * 60 * 60;

/** Shared demo accounts so anyone can try a bidding war in two tabs. */
export const DEMO_PASSWORD = "demo1234";
export const DEMO_USERS = [
  { username: "alice", displayName: "Alice" },
  { username: "bob", displayName: "Bob" },
  { username: "priya", displayName: "Priya" },
];

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.REDIS_URL) {
    // Fallback so a missing AUTH_SECRET never takes the site down: derive from another server-only secret.
    return createHmac("sha256", process.env.REDIS_URL).update("livebid-session").digest("hex");
  }
  return "livebid-dev-secret-not-for-production";
}

/* ---------- Passwords ---------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

/* ---------- Sessions ---------- */

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(user: SessionUser, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ i: user.id, u: user.username, d: user.displayName, e: Math.floor(now / 1000) + SESSION_TTL_S }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { i: string; u: string; d: string; e: number };
    if (p.e * 1000 < now) return null;
    return { id: p.i, username: p.u, displayName: p.d };
  } catch {
    return null;
  }
}

/** The signed-in user for this request, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookie = (token: string) => ({
  name: SESSION_COOKIE,
  value: token,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_S,
});

/* ---------- Accounts ---------- */

export type AuthResult = { ok: true; user: SessionUser } | { ok: false; message: string };

const USERNAME = /^[a-z0-9_]{3,20}$/;

export function validateSignup(raw: unknown): { ok: true; username: string; displayName: string; password: string } | { ok: false; message: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const username = String(r.username ?? "").trim().toLowerCase();
  const password = String(r.password ?? "");
  const displayName = String(r.displayName ?? "").trim() || username;
  if (!USERNAME.test(username)) return { ok: false, message: "Username: 3–20 letters, numbers or _." };
  if (password.length < 6 || password.length > 72) return { ok: false, message: "Password must be 6–72 characters." };
  if (displayName.length < 2 || displayName.length > 24) return { ok: false, message: "Display name must be 2–24 characters." };
  return { ok: true, username, displayName, password };
}

const toSession = (u: User): SessionUser => ({ id: u.id, username: u.username, displayName: u.displayName });

export async function signUp(store: AuctionStore, raw: unknown): Promise<AuthResult> {
  const v = validateSignup(raw);
  if (!v.ok) return v;
  const user: User = {
    id: newId(),
    username: v.username,
    displayName: v.displayName,
    passwordHash: await hashPassword(v.password),
    createdAt: Date.now(),
  };
  if (!(await store.createUser(user))) return { ok: false, message: "That username is taken." };
  return { ok: true, user: toSession(user) };
}

export async function logIn(store: AuctionStore, raw: unknown): Promise<AuthResult> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const username = String(r.username ?? "").trim().toLowerCase();
  const password = String(r.password ?? "");
  if (DEMO_USERS.some((d) => d.username === username)) await ensureDemoUsers(store);
  const user = username ? await store.getUser(username) : null;
  // Same message either way, so the form does not reveal which usernames exist.
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { ok: false, message: "Wrong username or password." };
  return { ok: true, user: toSession(user) };
}

export async function ensureDemoUsers(store: AuctionStore) {
  for (const d of DEMO_USERS) {
    if (await store.getUser(d.username)) continue;
    await store.createUser({ id: `demo-${d.username}`, ...d, passwordHash: await hashPassword(DEMO_PASSWORD), createdAt: Date.now() });
  }
}
