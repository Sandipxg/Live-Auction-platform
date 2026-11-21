import { Lobby } from "@/components/Lobby";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Live auctions</h1>
        <p className="lede">
          Prices update the moment a bid lands. A bid in the final ten seconds resets the clock to ten seconds, so the
          winner is whoever is truly willing to pay most — not whoever clicks last.
        </p>
      </section>
      <Lobby />
    </>
  );
}
