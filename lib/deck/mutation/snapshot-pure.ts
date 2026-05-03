import { Format } from "@/lib/generated/prisma/enums";
import type { Legalities } from "@/lib/card/types-meta";
import type { Deck } from "@/lib/deck/zone-view";
import type { DeckSnapshot, SnapshotCard } from "./types";

type CardMetaValue = {
  name: string;
  typeLine: string | null;
  colorIdentity: string[];
  legalities: Legalities;
};

export function snapshotFromDeck(deck: Deck): DeckSnapshot {
  const cards: SnapshotCard[] = deck.cards.map((dc) => ({
    id: dc.id,
    cardId: dc.cardId,
    cardName: dc.card.name,
    zone: dc.zone,
    category: dc.category,
    quantity: dc.quantity,
    typeLine: dc.card.typeLine ?? null,
    colorIdentity: dc.card.colorIdentity ?? [],
    legalities: (dc.card.legalities as Legalities) ?? {},
    printingId: dc.printingId ?? null,
    isFoil: dc.isFoil,
  }));
  const cardMeta = new Map<number, CardMetaValue>();
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

type SnapshotFromCardsInput = {
  deckId?: string;
  format: Format;
  cards: SnapshotCard[];
  categoryNames?: string[];
  extraMeta?: ReadonlyArray<{
    cardId: number;
    name: string;
    typeLine: string | null;
    colorIdentity?: string[];
    legalities?: Legalities;
  }>;
};

/**
 * Build a snapshot from explicit card rows. Used by tests and any caller
 * that already has SnapshotCards in hand without a Deck or deckId.
 */
export function snapshotFromCards(input: SnapshotFromCardsInput): DeckSnapshot {
  const cardMeta = new Map<number, CardMetaValue>();
  for (const c of input.cards) {
    cardMeta.set(c.cardId, {
      name: c.cardName,
      typeLine: c.typeLine,
      colorIdentity: c.colorIdentity,
      legalities: c.legalities,
    });
  }
  for (const m of input.extraMeta ?? []) {
    cardMeta.set(m.cardId, {
      name: m.name,
      typeLine: m.typeLine,
      colorIdentity: m.colorIdentity ?? [],
      legalities: m.legalities ?? {},
    });
  }
  return {
    deckId: input.deckId ?? "snapshot",
    format: input.format,
    cards: input.cards,
    categoryNames: input.categoryNames ?? [],
    cardMeta,
  };
}

