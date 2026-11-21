import { NextResponse } from "next/server";
import { createSessionToken, logIn, sessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const r = await logIn(getStore(), body);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 401 });
  const res = NextResponse.json({ user: r.user });
  res.cookies.set(sessionCookie(createSessionToken(r.user)));
  return res;
}
