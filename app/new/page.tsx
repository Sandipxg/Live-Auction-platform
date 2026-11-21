import { redirect } from "next/navigation";
import { NewAuctionForm } from "@/components/NewAuctionForm";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewAuctionPage() {
  if (!(await currentUser())) redirect("/login?next=/new");
  return <NewAuctionForm />;
}
