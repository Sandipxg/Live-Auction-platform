# Context — the measured design system

All values live as CSS custom properties in [`app/globals.css`](../app/globals.css). Change them there; never hard‑code a value in a component.

## Principles

1. **The price and the clock are the product.** They are the largest things on screen, in tabular figures so digits never jump.
2. **One accent, used only for urgency and action.** Red‑orange means "act now": the primary bid button, the last 10 seconds, extensions.
3. **Green means you.** Leading, winning, confirmations.
4. **Motion confirms change, never decorates.** A price flashes when it changes; nothing else moves without reason.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f5f1` | `#0f1220` | Page background (warm paper) |
| `--surface` | `#ffffff` | `#171b2d` | Cards, panels |
| `--surface-2` | `#efede6` | `#1f2438` | Segmented controls, neutral banners |
| `--ink` | `#161a2e` | `#eef0f7` | Primary text, ink buttons |
| `--ink-2` | `#3a3f55` | `#c9cde0` | Secondary text |
| `--muted` | `#646979` | `#9298ad` | Labels, meta |
| `--line` | `#e3e0d7` | `#2a3047` | Borders, dividers |
| `--accent` | `#d63f22` | `#ff6a4d` | Bid button, urgent clock, extensions |
| `--accent-soft` | `#fde9e4` | `#3a1d17` | Price flash, `+10s` tag |
| `--live` | `#0f7343` | `#3ccf84` | Live pill, leading, won |
| `--warn` | `#a35a05` | `#f0a443` | Outbid, rejected, reconnecting |

Contrast: `--ink` on `--bg` ≈ 16:1; `--muted` on `--surface` ≈ 5.5:1 (AA); `--live` on `--live-soft` ≈ 5.1:1; `--warn` on `--warn-soft` ≈ 4.7:1; white on `--accent` ≈ 4.6:1 (AA); `--accent` text on `--accent-soft` ≈ 3.9:1, used only for the bold `+10s` tag and large numerals.

Item tiles are generated: `radial-gradient(hsl(h 75% 62%), hsl(h 60% 38%))` with a hue per item, white initials.

## Type

Family: **Inter** (Google Fonts), fallback `system-ui`. Numbers use `font-variant-numeric: tabular-nums`.

| Token | Size | Weight | Use |
|---|---|---|---|
| `--fs-price` | 56 px (40 px < 560 px wide) | 800, −0.045em | Auction room price and clock |
| `--fs-2xl` | 40 px (32 px mobile) | 800 | Page title |
| `--fs-xl` | 28 px | 750–800 | Card price, room title |
| `--fs-lg` | 20 px | 400–750 | Lede, result title |
| `--fs-md` | 16 px | 400–650 | Body, card title |
| `--fs-sm` | 14 px | 500–600 | Buttons, meta, history |
| `--fs-xs` | 12 px | 600, uppercase, +0.06em | Labels, pills |

## Spacing

4 px base: `--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 24 · `--s6` 32 · `--s7` 48 · `--s8` 64.
Page gutter 16 px; max content width 1120 px; card padding 16 px; panel padding 24 px.

## Shape & depth

Radii: `--r-sm` 8 (inputs, buttons) · `--r-md` 12 (tiles) · `--r-lg` 16 (cards, panels). Two shadows only: `--shadow` (resting) and `--shadow-hover`.

Controls: buttons 40 px tall (34 small, 52 large — the bid buttons). Inputs 44 px. All tap targets ≥ 40 px.

## Motion

| Token / keyframe | Value | Where |
|---|---|---|
| `--ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | Everything |
| `--t-fast` | 150 ms | Hover, press |
| `--t-med` | 250 ms | Card lift, notices, history row slide‑in |
| `--t-flash` / `flash` | 700 ms | Background flash when a price changes (keyed on `version`) |
| `pulse` | 1.6 s (0.8 s when closing) | Live dots |
| `tick` | 1 s steps | Clock in the final 10 seconds |

`prefers-reduced-motion: reduce` disables all animation and transitions.

## Breakpoints

- **≤ 860 px**: auction room becomes one column; history moves below.
- **≤ 560 px**: single‑column grid, smaller price, primary bid button spans full width.
