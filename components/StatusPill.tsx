import type { AuctionStatus } from "@/lib/types";

const LABEL: Record<AuctionStatus, string> = { live: "Live", closing: "Closing", closed: "Ended" };

export function StatusPill({ status }: { status: AuctionStatus }) {
  return (
    <span className={`pill pill-${status}`}>
      {status !== "closed" && <span className="dot" aria-hidden />}
      {LABEL[status]}
    </span>
  );
}
