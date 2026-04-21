import type { Zone } from "@/lib/generated/prisma/enums";
import type { DeckCard } from "@/lib/deck/zone-view";

/**
 * Fisher-Yates in-place shuffle. Accepts a random source for testability.
 */
export function shuffleDeck<T>(cards: T[], random: () => number = Math.random): T[] {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Expands DeckCard quantities into a flat array for the library. Only MAINBOARD
 * cards are included — sideboard, considering, and commander are excluded
 * (commander starts in the command zone, not the library).
 */
export function expandQuantities<T extends { quantity: number; zone: Zone }>(
  deckCards: T[],
): T[] {
  const result: T[] = [];
  for (const dc of deckCards) {
    if (dc.zone !== "MAINBOARD") continue;
    for (let i = 0; i < dc.quantity; i++) {
      result.push(dc);
    }
  }
  return result;
}

export type DrawnCard = DeckCard;

/**
 * Draws a hand from the deck. Returns up to handSize items (or fewer if the
 * mainboard has fewer cards available).
 */
export function drawHand<T extends { quantity: number; zone: Zone }>(
  deckCards: T[],
  handSize = 7,
): T[] {
  const expanded = expandQuantities(deckCards);
  const shuffled = shuffleDeck(expanded);
  return shuffled.slice(0, handSize);
}
