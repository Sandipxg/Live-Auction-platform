import "server-only";
import { statusOf } from "./engine";
import type { AuctionStore } from "./store";
import type { CreateAuctionInput } from "./types";

/**
 * Keeps the public demo alive: whenever fewer than MIN_LIVE auctions are open,
 * new ones are drawn from this catalog. Guarded by a cross-instance lock so a
 * crowd of visitors cannot create duplicates.
 */
const CATALOG: (CreateAuctionInput & { hue: number })[] = [
  { title: "1967 Leica M4 Rangefinder", description: "Black paint body, serviced last year. Shutter accurate at all speeds.", startingPrice: 42000, minIncrement: 500, durationMinutes: 6, hue: 28 },
  { title: "Signed First-Edition Novel", description: "Hardcover first printing with the author's signature on the title page.", startingPrice: 8000, minIncrement: 200, durationMinutes: 4, hue: 210 },
  { title: "Royal Enfield Bullet 350 (1984)", description: "Restored, original tank, papers in order. Pickup in Ahmedabad.", startingPrice: 95000, minIncrement: 1000, durationMinutes: 12, hue: 4 },
  { title: "Hand-woven Patola Silk Saree", description: "Double-ikat Patan Patola, natural dyes, six yards.", startingPrice: 60000, minIncrement: 1000, durationMinutes: 9, hue: 330 },
  { title: "Mechanical Keyboard — Custom Build", description: "Aluminium case, lubed linear switches, PBT keycaps.", startingPrice: 9000, minIncrement: 250, durationMinutes: 3, hue: 160 },
  { title: "Vintage HMT Janata Wristwatch", description: "Hand-wound, keeps good time, original dial.", startingPrice: 3500, minIncrement: 100, durationMinutes: 5, hue: 45 },
  { title: "Original Oil Painting — Monsoon", description: "60 × 90 cm on canvas, signed by the artist.", startingPrice: 25000, minIncrement: 500, durationMinutes: 15, hue: 195 },
  { title: "Cricket Bat Signed by Team XI", description: "Full-size English willow bat with eleven signatures.", startingPrice: 30000, minIncrement: 1000, durationMinutes: 8, hue: 120 },
  { title: "Brass Telescope, 19th Century", description: "Three-draw marine telescope with leather grip.", startingPrice: 18000, minIncrement: 500, durationMinutes: 7, hue: 38 },
  { title: "Retro Game Console Bundle", description: "Console, two controllers and twelve cartridges, all tested.", startingPrice: 6000, minIncrement: 200, durationMinutes: 2, hue: 265 },
];

const MIN_LIVE = 6;

export async function ensureDemoInventory(store: AuctionStore) {
  await store.once("demo-inventory", 15_000, async () => {
    const { auctions, serverNow } = await store.list(60);
    const open = auctions.filter((a) => statusOf(a, serverNow) !== "closed");
    const missing = MIN_LIVE - open.length;
    if (missing <= 0) return;
    const openTitles = new Set(open.map((a) => a.title));
    const pool = CATALOG.filter((c) => !openTitles.has(c.title));
    // Rotate through the catalog so the same items do not always reappear first.
    const offset = Math.floor(serverNow / 60_000) % pool.length;
    for (let i = 0; i < missing && i < pool.length; i++) {
      const item = pool[(offset + i) % pool.length];
      await store.create(item, item.hue);
    }
  });
}
