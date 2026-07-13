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

type CardMetaInput = {
  cardId: number;
  name: string;
  typeLine?: string | null | undefined;
  colorIdentity?: string[] | null | undefined;
  legalities?: Legalities | null | undefined;
};

/**
 * Build the `cardId → meta` map shared by every snapshot entry point, applying
 * the canonical defaults (`typeLine ?? null`, `colorIdentity ?? []`,
 * `legalities ?? {}`) in one place. `extra` rows are layered on top, letting
 * callers fold in card metadata fetched outside the deck's own rows.
 */
export function buildCardMeta(
  entries: Iterable<CardMetaInput>,
  extra?: Iterable<CardMetaInput>,
): Map<number, CardMetaValue> {
  const map = new Map<number, CardMetaValue>();
  const put = (e: CardMetaInput) => {
    map.set(e.cardId, {
      name: e.name,
      typeLine: e.typeLine ?? null,
      colorIdentity: e.colorIdentity ?? [],
      legalities: e.legalities ?? {},
    });
  };
  for (const e of entries) put(e);
  if (extra) for (const e of extra) put(e);
  return map;
}

export function snapshotFromDeck(deck: Deck): DeckSnapshot {
  const cards: SnapshotCard[] = deck.cards.map((dc) => ({
    id: dc.id,
    cardId: dc.cardId,
    cardName: dc.card.name,
    zone: dc.zone,
    categories: [...dc.categories],
    quantity: dc.quantity,
    typeLine: dc.card.typeLine ?? null,
    colorIdentity: dc.card.colorIdentity ?? [],
    legalities: (dc.card.legalities as Legalities) ?? {},
    printingId: dc.printingId ?? null,
    isFoil: dc.isFoil,
    cmc: dc.card.cmc ?? null,
    manaCost: dc.card.manaCost ?? null,
    oracleText: dc.card.oracleText ?? null,
  }));
  return {
    deckId: deck.id,
    format: deck.format as Format,
    cards,
    categoryNames: (deck.categories ?? []).map((c) => c.name),
    cardMeta: buildCardMeta(
      cards.map((c) => ({
        cardId: c.cardId,
        name: c.cardName,
        typeLine: c.typeLine,
        colorIdentity: c.colorIdentity,
        legalities: c.legalities,
      })),
    ),
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
  return {
    deckId: input.deckId ?? "snapshot",
    format: input.format,
    cards: input.cards,
    categoryNames: input.categoryNames ?? [],
    cardMeta: buildCardMeta(
      input.cards.map((c) => ({
        cardId: c.cardId,
        name: c.cardName,
        typeLine: c.typeLine,
        colorIdentity: c.colorIdentity,
        legalities: c.legalities,
      })),
      input.extraMeta?.map((m) => ({
        cardId: m.cardId,
        name: m.name,
        typeLine: m.typeLine,
        colorIdentity: m.colorIdentity,
        legalities: m.legalities,
      })),
    ),
  };
}

