import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  AUCTION_CLOSED: 409,
  BID_TOO_LOW: 409,
  ALREADY_LEADING: 409,
  INVALID: 400,
  BUSY: 503,
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const bidId = String(body?.bidId ?? "").slice(0, 64);
  if (!body || !bidId) return NextResponse.json({ ok: false, reason: "INVALID", message: "Invalid request." }, { status: 400 });

  const result = await getStore().placeBid({
    auctionId: id,
    bidId,
    bidderId: String(body.bidderId ?? "").slice(0, 64),
    bidderName: String(body.bidderName ?? ""),
    amount: Number(body.amount),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS[result.reason] ?? 400 });
}
