import { describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, logIn, readSessionToken, signUp, validateSignup, verifyPassword } from "@/lib/auth";
import { memoryStore } from "@/lib/store/memory";

const user = { id: "u1", username: "alice", displayName: "Alice" };

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const h1 = await hashPassword("secret123");
    const h2 = await hashPassword("secret123");
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain("secret123");
    expect(await verifyPassword("secret123", h1)).toBe(true);
    expect(await verifyPassword("wrong", h1)).toBe(false);
  });
});

describe("sessions", () => {
  it("round-trips a signed token", () => {
    expect(readSessionToken(createSessionToken(user))).toEqual(user);
  });
  it("rejects a tampered token", () => {
    const [payload, sig] = createSessionToken(user).split(".");
    const forged = Buffer.from(JSON.stringify({ i: "u2", u: "bob", d: "Bob", e: 9e9 })).toString("base64url");
    expect(readSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(readSessionToken(`${payload}.x${sig}`)).toBeNull();
    expect(readSessionToken("garbage")).toBeNull();
  });
  it("rejects an expired token", () => {
    const t = createSessionToken(user, Date.now() - 8 * 24 * 3600 * 1000);
    expect(readSessionToken(t)).toBeNull();
  });
});

describe("accounts", () => {
  it("validates sign-up input", () => {
    expect(validateSignup({ username: "ab", password: "123456" }).ok).toBe(false);
    expect(validateSignup({ username: "good_name", password: "123" }).ok).toBe(false);
    expect(validateSignup({ username: "Good_Name", password: "123456" })).toMatchObject({ ok: true, username: "good_name" });
  });
  it("signs up, rejects duplicates, and logs in", async () => {
    expect((await signUp(memoryStore, { username: "carol", password: "pass1234", displayName: "Carol" })).ok).toBe(true);
    expect(await signUp(memoryStore, { username: "CAROL", password: "pass1234" })).toMatchObject({ ok: false });
    expect(await logIn(memoryStore, { username: "Carol", password: "pass1234" })).toMatchObject({ ok: true, user: { displayName: "Carol" } });
    expect(await logIn(memoryStore, { username: "carol", password: "nope" })).toMatchObject({ ok: false });
    expect(await logIn(memoryStore, { username: "nobody", password: "nope" })).toMatchObject({ ok: false });
  });
  it("creates demo accounts on first use", async () => {
    expect(await logIn(memoryStore, { username: "bob", password: "demo1234" })).toMatchObject({ ok: true, user: { displayName: "Bob" } });
  });
});
