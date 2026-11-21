/** Generated artwork for an item: a coloured tile with the item's initials. */
export function Tile({ title, hue, size = "md" }: { title: string; hue: number; size?: "md" | "lg" }) {
  const initials = title
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div
      className={`tile tile-${size}`}
      style={{ "--h": hue } as React.CSSProperties}
      aria-hidden
    >
      <span>{initials}</span>
    </div>
  );
}
