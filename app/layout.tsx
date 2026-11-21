import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { currentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveBid — Live Auction Platform",
  description: "Real-time auctions: live prices, fair late-bid extensions, and an unambiguous winner.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>
                <span />
              </span>
              LiveBid
            </Link>
            <nav className="nav">
              <Link href="/">Auctions</Link>
              <Link href="/new" className="btn btn-sm btn-ink">
                Start an auction
              </Link>
              <UserMenu user={user} />
            </nav>
          </div>
        </header>
        <main className="wrap main">{children}</main>
        <footer className="wrap footer">
          Prototype · Late bids extend the clock to 10 seconds, so nobody wins by bidding in the last instant.
        </footer>
      </body>
    </html>
  );
}
