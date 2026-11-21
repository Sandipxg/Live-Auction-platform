import { notFound } from "next/navigation";
import { AuctionRoom } from "@/components/AuctionRoom";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await getStore().snapshot(id);
  if (!snap) notFound();
  return <AuctionRoom initial={snap} />;
}
