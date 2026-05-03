import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Legalities } from "@/lib/card/types-meta";
import { getCardLegalityForDeck } from "./legality";

type AddCardInput = { quantity: number; term: string };

/**
 * Parse a header-search input like "3x Lightning Bolt" or "2 sol ring" into
 * a quantity + term. Falls back to quantity 1 if no leading count is present.
 */
export function parseAddCardInput(raw: string): AddCardInput {
  const match = raw.match(/^\s*(\d{1,2})x?\s+(.+)$/);
  if (match?.[1] && match[2]) {
    return { quantity: Number(match[1]), term: match[2].trim() };
  }
  return { quantity: 1, term: raw.trim() };
}

export type AddDestination =
  | { kind: "dest-mainboard"; category: string | null }
  | { kind: "dest-zone"; zone: Zone; disabled?: boolean; hint?: string }
  | { kind: "dest-create-category" };

type BuildAddDestinationsArgs = {
  format: Format | undefined;
  categories: readonly string[];
  commanderFull: boolean;
};

/**
 * Build the ordered list of destinations a card can be added to. Commander
 * decks include the COMMANDER zone; the entry is disabled once a commander
 * is set.
 */
export function buildAddDestinations({
  format,
  categories,
  commanderFull,
}: BuildAddDestinationsArgs): AddDestination[] {
  const items: AddDestination[] = [];
  items.push({ kind: "dest-mainboard", category: null });
  for (const name of categories) {
    items.push({ kind: "dest-mainboard", category: name });
  }
  items.push({ kind: "dest-zone", zone: Zone.SIDEBOARD });
  items.push({ kind: "dest-zone", zone: Zone.CONSIDERING });
  if (format === Format.COMMANDER) {
    items.push({
      kind: "dest-zone",
      zone: Zone.COMMANDER,
      disabled: commanderFull,
      ...(commanderFull && { hint: "Commander already set" }),
    });
  }
  items.push({ kind: "dest-create-category" });
  return items;
}

export type IntentDeckCard = {
  card: { id: number };
  zone: Zone;
  quantity: number;
};

type IntentCard = {
  id: number;
  name: string;
  legalities: Legalities;
  typeLine?: string | null;
  colorIdentity?: string[];
};

type EvaluateAddIntentArgs = {
  card: IntentCard;
  format: Format | undefined;
  deckCards: readonly IntentDeckCard[];
  quantity: number;
  commanderIdentity?: string[];
};

type AddIntentEvaluation = {
  legal: boolean;
  reasons: string[];
  projectedCopies: number;
  currentCopies: number;
};

/**
 * Count how many copies of this card are already in the deck's main play
 * zones (mainboard + commander). Sideboard and considering don't count
 * toward singleton/playset limits.
 */
function countCurrentCopies(
  deckCards: readonly IntentDeckCard[],
  cardId: number,
): number {
  let total = 0;
  for (const dc of deckCards) {
    if (dc.card.id !== cardId) continue;
    if (dc.zone !== Zone.MAINBOARD && dc.zone !== Zone.COMMANDER) continue;
    total += dc.quantity;
  }
  return total;
}

/**
 * Evaluate whether adding `quantity` copies of `card` to the deck would
 * produce a legal state. When no format is set, the intent is treated as
 * legal (CASUAL-style).
 */
export function evaluateAddIntent({
  card,
  format,
  deckCards,
  quantity,
  commanderIdentity,
}: EvaluateAddIntentArgs): AddIntentEvaluation {
  const currentCopies = countCurrentCopies(deckCards, card.id);
  const projectedCopies = currentCopies + quantity;

  if (!format) {
    return { legal: true, reasons: [], projectedCopies, currentCopies };
  }

  const { legal, reasons } = getCardLegalityForDeck({
    card: {
      name: card.name,
      legalities: card.legalities,
      ...(card.typeLine !== undefined && { typeLine: card.typeLine }),
      ...(card.colorIdentity !== undefined && { colorIdentity: card.colorIdentity }),
    },
    format,
    currentCopiesInDeck: currentCopies,
    addingQuantity: quantity,
    ...(commanderIdentity !== undefined && { commanderIdentity }),
  });

  return { legal, reasons, projectedCopies, currentCopies };
}
