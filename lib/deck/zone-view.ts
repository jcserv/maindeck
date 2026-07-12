import type { Zone } from "@/lib/generated/prisma/enums";
import {
  resolveCardImage as resolveCardImageRule,
  resolveCardBackImage as resolveCardBackImageRule,
} from "@/lib/card/image";
import { assertNever } from "@/lib/utils";
import type { getDeckById } from "./queries";

export type Deck = NonNullable<Awaited<ReturnType<typeof getDeckById>>>;
/**
 * `isSecondary` is set on the fan-out copies `groupByCategory` emits for a
 * card's non-primary memberships: they render ghosted, don't count toward
 * section totals, and are not draggable.
 */
export type DeckCard = Deck["cards"][number] & { isSecondary?: boolean };

export function resolveCardImage(dc: DeckCard): string | null {
  return resolveCardImageRule({ printing: dc.printing, card: dc.card });
}

export function resolveCardBackImage(dc: DeckCard): string | null {
  return resolveCardBackImageRule({ printing: dc.printing, card: dc.card });
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
      /** Ordered category memberships; `[0]` is the primary. */
      categories: string[];
    };

export function applyZoneOptimistic(
  cards: DeckCard[],
  action: ZoneAction,
): DeckCard[] {
  switch (action.type) {
    case "remove":
      return cards.filter((c) => c.id !== action.deckCardId);
    case "move":
      return cards.map((c) =>
        c.id === action.deckCardId
          ? { ...c, zone: action.zone, categories: action.categories }
          : c,
      );
    case "update":
      if (action.quantity <= 0) {
        return cards.filter((c) => c.id !== action.deckCardId);
      }
      return cards.map((c) =>
        c.id === action.deckCardId ? { ...c, quantity: action.quantity } : c,
      );
    default:
      return assertNever(action);
  }
}
