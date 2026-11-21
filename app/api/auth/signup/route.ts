import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie, signUp } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const r = await signUp(getStore(), body);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  const res = NextResponse.json({ user: r.user }, { status: 201 });
  res.cookies.set(sessionCookie(createSessionToken(r.user)));
  return res;
}
