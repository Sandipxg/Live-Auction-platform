import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <h1>Auction not found</h1>
      <p className="muted">It may have expired — finished auctions are kept for seven days.</p>
      <Link href="/" className="btn btn-ink">
        Back to auctions
      </Link>
    </div>
  );
}
