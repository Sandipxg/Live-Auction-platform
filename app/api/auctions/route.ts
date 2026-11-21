import { NextResponse } from "next/server";
import { ensureDemoInventory } from "@/lib/demo";
import { validateCreate } from "@/lib/engine";
import { currentUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  await ensureDemoInventory(store);
  const { auctions, serverNow } = await store.list(60);
  return NextResponse.json({ auctions, serverNow, store: store.kind }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await currentUser())) return NextResponse.json({ error: "Log in to start an auction." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const v = validateCreate(body);
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 });
  const auction = await getStore().create(v.value);
  return NextResponse.json({ auction }, { status: 201 });
}
