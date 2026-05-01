import { Format } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { Deck } from "@/lib/deck/zone-view";
import { checkStructural, projectChanges } from "./invariants";
import { fullLegality } from "./legality-rules";
import type {
  DeckSnapshot,
  LegalityIssue,
  PlannedChange,
  SnapshotCard,
} from "./types";

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
    legalities: (dc.card.legalities as Record<string, string>) ?? {},
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

export type SnapshotFromCardsInput = {
  deckId?: string;
  format: Format;
  cards: SnapshotCard[];
  categoryNames?: string[];
  extraMeta?: ReadonlyArray<{
    cardId: number;
    name: string;
    typeLine: string | null;
    colorIdentity?: string[];
    legalities?: Record<string, string>;
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

export type PreviewResult = {
  structural: LegalityIssue[];
  legality: LegalityIssue[];
  projected: DeckSnapshot;
};

/**
 * Pure: project the changes onto the snapshot and return structural and
 * legality issues for the projected deck.
 *
 * Callers can decide which (if any) issues to gate on.
 */
export function previewChanges(
  before: DeckSnapshot,
  changes: readonly PlannedChange[],
): PreviewResult {
  const projected = projectChanges(before, changes);
  const structural = checkStructural(changes);
  const beforeMessages = new Set(fullLegality(before).map((i) => i.message));
  const legality = fullLegality(projected).filter(
    (i) => !beforeMessages.has(i.message),
  );
  return { structural, legality, projected };
}
