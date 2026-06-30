import { type Format, type Zone } from "@/lib/generated/prisma/enums";
import {
  type DeckCardWithRelations,
  computeAverageMV,
  computeColorPips,
  computeManaCurve,
  computeTypeBreakdown,
  countLands,
  expectedLandsInHand,
} from "@/lib/stats/compute";

// A DeckCard carries enough to be both diffed (by oracle Card) and fed to the
// stats helpers. It is structurally a superset of the stats input.
export type ComparableDeckCard = DeckCardWithRelations & {
  cardId: number;
  card: DeckCardWithRelations["card"] & { name: string };
};

export interface ComparableDeck {
  id: string;
  name: string;
  format: Format;
  cards: ComparableDeckCard[];
}

// Comparison mirrors stats: a deck's identity is its MAINBOARD + COMMANDER.
// SIDEBOARD and CONSIDERING are scratch space, not part of what "differs".
const EXCLUDED_ZONES = new Set<Zone>(["SIDEBOARD", "CONSIDERING"]);

function deckableCards(cards: ComparableDeckCard[]): ComparableDeckCard[] {
  return cards.filter((dc) => !EXCLUDED_ZONES.has(dc.zone));
}

/**
 * Collapse a deck's deckable cards to total quantity per oracle Card.
 * Keying by `cardId` (not name or printing) means two printings of the same
 * Card aggregate, matching how singleton/quantity rules actually work.
 */
function quantityByCard(
  cards: ComparableDeckCard[],
): Map<number, { name: string; quantity: number }> {
  const byCard = new Map<number, { name: string; quantity: number }>();
  for (const dc of deckableCards(cards)) {
    const existing = byCard.get(dc.cardId);
    if (existing) {
      existing.quantity += dc.quantity;
    } else {
      byCard.set(dc.cardId, { name: dc.card.name, quantity: dc.quantity });
    }
  }
  return byCard;
}

/** A Card present in only one of the two decks. */
export interface SoloCardDiff {
  cardId: number;
  name: string;
  quantity: number;
}

/** A Card present in both decks, possibly at different quantities. */
export interface SharedCardDiff {
  cardId: number;
  name: string;
  aQuantity: number;
  bQuantity: number;
  /** bQuantity - aQuantity. Nonzero means the count changed. */
  delta: number;
}

export interface CardComparison {
  /** In B but not A. */
  added: SoloCardDiff[];
  /** In A but not B. */
  removed: SoloCardDiff[];
  /** In both decks (sorted by name); inspect `delta` for quantity changes. */
  shared: SharedCardDiff[];
  summary: {
    addedCards: number;
    removedCards: number;
    sharedCards: number;
    /** Shared Cards whose quantity differs between the decks. */
    changedCards: number;
  };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

export function compareDeckCards(
  a: ComparableDeck,
  b: ComparableDeck,
): CardComparison {
  const aByCard = quantityByCard(a.cards);
  const bByCard = quantityByCard(b.cards);

  const added: SoloCardDiff[] = [];
  const removed: SoloCardDiff[] = [];
  const shared: SharedCardDiff[] = [];

  for (const [cardId, { name, quantity }] of aByCard) {
    const inB = bByCard.get(cardId);
    if (inB) {
      shared.push({
        cardId,
        name,
        aQuantity: quantity,
        bQuantity: inB.quantity,
        delta: inB.quantity - quantity,
      });
    } else {
      removed.push({ cardId, name, quantity });
    }
  }

  for (const [cardId, { name, quantity }] of bByCard) {
    if (!aByCard.has(cardId)) {
      added.push({ cardId, name, quantity });
    }
  }

  added.sort(byName);
  removed.sort(byName);
  shared.sort(byName);

  return {
    added,
    removed,
    shared,
    summary: {
      addedCards: added.length,
      removedCards: removed.length,
      sharedCards: shared.length,
      changedCards: shared.filter((s) => s.delta !== 0).length,
    },
  };
}

export interface DeckStatBlock {
  /** Total quantity across MAINBOARD + COMMANDER. */
  cardCount: number;
  manaCurve: Record<string, number>;
  colorPips: { W: number; U: number; B: number; R: number; G: number; C: number };
  typeBreakdown: Record<string, number>;
  avgMV: number;
  landCount: number;
  expectedLands: number;
}

function statBlock(deck: ComparableDeck): DeckStatBlock {
  const cards = deckableCards(deck.cards);
  return {
    cardCount: cards.reduce((sum, dc) => sum + dc.quantity, 0),
    manaCurve: computeManaCurve(cards),
    colorPips: computeColorPips(cards),
    typeBreakdown: computeTypeBreakdown(cards),
    avgMV: computeAverageMV(cards),
    landCount: countLands(cards),
    expectedLands: expectedLandsInHand(cards),
  };
}

export interface StatsComparison {
  a: DeckStatBlock;
  b: DeckStatBlock;
}

export function compareDeckStats(
  a: ComparableDeck,
  b: ComparableDeck,
): StatsComparison {
  return { a: statBlock(a), b: statBlock(b) };
}

export interface DeckComparisonMeta {
  id: string;
  name: string;
  format: Format;
  /** Set for external decks (Moxfield, Archidekt) — use as the link href instead of /deck/{id}. */
  url?: string;
}

export interface DeckComparisonResult {
  a: DeckComparisonMeta;
  b: DeckComparisonMeta;
  cards: CardComparison;
  stats: StatsComparison;
}

const meta = (d: ComparableDeck): DeckComparisonMeta => ({
  id: d.id,
  name: d.name,
  format: d.format,
});

export function compareDecks(
  a: ComparableDeck,
  b: ComparableDeck,
): DeckComparisonResult {
  return {
    a: meta(a),
    b: meta(b),
    cards: compareDeckCards(a, b),
    stats: compareDeckStats(a, b),
  };
}
