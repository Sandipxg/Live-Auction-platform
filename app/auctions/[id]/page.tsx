import { notFound } from "next/navigation";
import { AuctionRoom } from "@/components/AuctionRoom";
import { currentUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [snap, user] = await Promise.all([getStore().snapshot(id), currentUser()]);
  if (!snap) notFound();
  return <AuctionRoom initial={snap} user={user} />;
}
