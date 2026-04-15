import type { ScryfallCard } from "./types";

const ALLOWED_LAYOUTS = new Set([
  "normal",
  "modal_dfc",
  "saga",
  "split",
  "transform",
]);

export function filterCard(card: ScryfallCard): boolean {
  if (card.lang !== "en") return false;
  if (!ALLOWED_LAYOUTS.has(card.layout)) return false;
  if (!card.games?.includes("paper")) return false;
  return true;
}
