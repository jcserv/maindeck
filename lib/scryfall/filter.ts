import type { ScryfallCard } from "./types";

// Denylist non-playable layouts. Scryfall adds new playable layouts (battle,
// case, class, etc.) without notice; an allowlist silently drops them. The
// shapes below have no place in a deckbuilder — tokens/emblems/schemes/planes
// aren't deckable, art_series is gallery data, vanguard is retired casual.
// Anything else flows through; if mapping fails (e.g. no image_uri), it's
// caught + logged in `lib/scryfall/map.ts`.
const DENIED_LAYOUTS = new Set([
  "token",
  "double_faced_token",
  "emblem",
  "planar",
  "scheme",
  "vanguard",
  "art_series",
]);

export function filterCard(card: ScryfallCard): boolean {
  if (card.lang !== "en") return false;
  if (DENIED_LAYOUTS.has(card.layout)) return false;
  if (!card.games?.includes("paper")) return false;
  return true;
}
