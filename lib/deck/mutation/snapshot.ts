import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Legalities } from "@/lib/card/types-meta";
import type {
  DeckSnapshot,
  PlannedChange,
  SnapshotCard,
} from "./types";

import { buildCardMeta, snapshotFromCards } from "./snapshot-pure";

export { snapshotFromCards };

type CardMetaRow = {
  id: number;
  name: string;
  typeLine: string | null;
  colorIdentity: string[];
  legalities: unknown;
};

export async function loadSnapshotForDeck(
  deckId: string,
  changes: readonly PlannedChange[] = [],
  tx?: Prisma.TransactionClient,
): Promise<DeckSnapshot> {
  const client = tx ?? prisma;
  const deck = await client.deck.findUnique({
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
          printingId: true,
          isFoil: true,
          categoryLinks: {
            select: { deckCategory: { select: { name: true } } },
            orderBy: { position: "asc" },
          },
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
    extraMeta = (await client.card.findMany({
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

  const cardMeta = buildCardMeta(
    deck.cards.map((dc) => ({
      cardId: dc.cardId,
      name: dc.card.name,
      typeLine: dc.card.typeLine,
      colorIdentity: dc.card.colorIdentity,
      legalities: dc.card.legalities as Legalities | null,
    })),
    extraMeta.map((m) => ({
      cardId: m.id,
      name: m.name,
      typeLine: m.typeLine,
      colorIdentity: m.colorIdentity,
      legalities: m.legalities as Legalities | null,
    })),
  );

  const cards: SnapshotCard[] = deck.cards.map((dc) => ({
    id: dc.id,
    cardId: dc.cardId,
    cardName: dc.card.name,
    zone: dc.zone,
    categories: dc.categoryLinks.map((l) => l.deckCategory.name),
    quantity: dc.quantity,
    typeLine: dc.card.typeLine,
    colorIdentity: dc.card.colorIdentity,
    legalities: (dc.card.legalities as Legalities) ?? {},
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
