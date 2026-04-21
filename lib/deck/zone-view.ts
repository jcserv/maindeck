import type { Zone } from "@/lib/generated/prisma/enums";
import type { getDeckById } from "./queries";

export type Deck = NonNullable<Awaited<ReturnType<typeof getDeckById>>>;
export type DeckCard = Deck["cards"][number];

/**
 * Resolve the best image URI for a deck card. Prefers the pinned printing's
 * image, falls back to the card's canonical first printing.
 */
export function resolveCardImage(dc: DeckCard): string | null {
  return dc.printing?.imageUri ?? dc.card.printings[0]?.imageUri ?? null;
}

export function isBasicLand(typeLine: string | null | undefined): boolean {
  return !!typeLine && /\bBasic\b/.test(typeLine) && /\bLand\b/.test(typeLine);
}

export type ZoneAction =
  | { type: "update"; deckCardId: string; quantity: number }
  | { type: "remove"; deckCardId: string }
  | {
      type: "move";
      deckCardId: string;
      zone: Zone;
      category: string | null;
    };

export function applyZoneOptimistic(
  cards: DeckCard[],
  action: ZoneAction,
): DeckCard[] {
  if (action.type === "remove") {
    return cards.filter((c) => c.id !== action.deckCardId);
  }
  if (action.type === "move") {
    return cards.map((c) =>
      c.id === action.deckCardId
        ? { ...c, zone: action.zone, category: action.category }
        : c,
    );
  }
  if (action.quantity <= 0) {
    return cards.filter((c) => c.id !== action.deckCardId);
  }
  return cards.map((c) =>
    c.id === action.deckCardId ? { ...c, quantity: action.quantity } : c,
  );
}
