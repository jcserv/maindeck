import "server-only";
import { prisma } from "@/lib/db";
import type {
  DeckSnapshot,
  PlannedChange,
  SnapshotCard,
} from "./types";

export { snapshotFromCards } from "./snapshot-pure";

type CardMetaRow = {
  id: number;
  name: string;
  typeLine: string | null;
  colorIdentity: string[];
  legalities: unknown;
};

type CardMetaValue = {
  name: string;
  typeLine: string | null;
  colorIdentity: string[];
  legalities: Record<string, string>;
};

export async function loadSnapshotForDeck(
  deckId: string,
  changes: readonly PlannedChange[] = [],
): Promise<DeckSnapshot> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: {
      id: true,
      format: true,
      cards: {
        select: {
          id: true,
          cardId: true,
          quantity: true,
          zone: true,
          category: true,
          printingId: true,
          isFoil: true,
          card: {
            select: {
              name: true,
              typeLine: true,
              colorIdentity: true,
              legalities: true,
            },
          },
        },
      },
      categories: { select: { name: true } },
    },
  });

  if (!deck) {
    throw new Error("Deck not found");
  }

  const newCardIds = new Set<number>();
  for (const change of changes) {
    if (change.op === "add") newCardIds.add(change.cardId);
  }
  for (const dc of deck.cards) newCardIds.delete(dc.cardId);

  let extraMeta: CardMetaRow[] = [];
  if (newCardIds.size > 0) {
    extraMeta = (await prisma.card.findMany({
      where: { id: { in: [...newCardIds] } },
      select: {
        id: true,
        name: true,
        typeLine: true,
        colorIdentity: true,
        legalities: true,
      },
    })) as CardMetaRow[];
  }

  const cardMeta = new Map<number, CardMetaValue>();
  for (const dc of deck.cards) {
    cardMeta.set(dc.cardId, {
      name: dc.card.name,
      typeLine: dc.card.typeLine,
      colorIdentity: dc.card.colorIdentity,
      legalities: (dc.card.legalities as Record<string, string>) ?? {},
    });
  }
  for (const m of extraMeta) {
    cardMeta.set(m.id, {
      name: m.name,
      typeLine: m.typeLine,
      colorIdentity: m.colorIdentity,
      legalities: (m.legalities as Record<string, string>) ?? {},
    });
  }

  const cards: SnapshotCard[] = deck.cards.map((dc) => ({
    id: dc.id,
    cardId: dc.cardId,
    cardName: dc.card.name,
    zone: dc.zone,
    category: dc.category,
    quantity: dc.quantity,
    typeLine: dc.card.typeLine,
    colorIdentity: dc.card.colorIdentity,
    legalities: (dc.card.legalities as Record<string, string>) ?? {},
    printingId: dc.printingId ?? null,
    isFoil: dc.isFoil,
  }));

  return {
    deckId: deck.id,
    format: deck.format,
    cards,
    categoryNames: deck.categories.map((c) => c.name),
    cardMeta,
  };
}
