import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Deck } from "@/lib/deck/zone-view";
import { fullLegality, checkSingleCard } from "./legality-rules";
import type { DeckSnapshot, LegalityIssue, SnapshotCard } from "./types";

export { applyChanges } from "./apply";
export { InvariantViolation } from "./errors";
export { diffDeck, type ExistingDeckCard } from "./diff";
export type { PlannedChange, LegalityIssue } from "./types";

export type DeckLegalityView = { legal: boolean; issues: LegalityIssue[] };

function snapshotFromDeck(deck: Deck): DeckSnapshot {
  const cards: SnapshotCard[] = deck.cards.map((dc) => ({
    id: dc.id,
    cardId: dc.cardId,
    cardName: dc.card.name,
    zone: dc.zone,
    category: dc.category,
    quantity: dc.quantity,
    typeLine: dc.card.typeLine ?? null,
    colorIdentity: dc.card.colorIdentity ?? [],
    legalities: (dc.card.legalities as Record<string, string>) ?? {},
    printingId: dc.printingId ?? null,
    isFoil: dc.isFoil,
  }));
  const cardMeta = new Map<
    number,
    {
      name: string;
      typeLine: string | null;
      colorIdentity: string[];
      legalities: Record<string, string>;
    }
  >();
  for (const c of cards) {
    cardMeta.set(c.cardId, {
      name: c.cardName,
      typeLine: c.typeLine,
      colorIdentity: c.colorIdentity,
      legalities: c.legalities,
    });
  }
  return {
    deckId: deck.id,
    format: deck.format as Format,
    cards,
    categoryNames: (deck.categories ?? []).map((c) => c.name),
    cardMeta,
  };
}

export function viewDeckLegality(deck: Deck): DeckLegalityView {
  const snap = snapshotFromDeck(deck);
  const issues = fullLegality(snap);
  return { legal: issues.length === 0, issues };
}

export function getCardLegalityForDeck(args: {
  card: {
    name: string;
    legalities: Record<string, string>;
    typeLine?: string | null;
    colorIdentity?: string[];
  };
  format: Format;
  currentCopiesInDeck: number;
  addingQuantity?: number;
  commanderIdentity?: string[];
}): { legal: boolean; reasons: string[] } {
  return checkSingleCard(args);
}

export type { Zone };
