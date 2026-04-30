import "server-only";
import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { Zone } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RevisionDelta } from "@/lib/deck/revision";
import { InvariantViolation } from "./errors";
import { checkStructural, projectChanges } from "./invariants";
import { recordDeckRevisionTx } from "./revision";
import type { DeckSnapshot, PlannedChange, SnapshotCard } from "./types";

type CardMetaRow = {
  id: number;
  name: string;
  typeLine: string | null;
  colorIdentity: string[];
  legalities: unknown;
};

async function loadSnapshot(
  deckId: string,
  changes: readonly PlannedChange[],
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

  const cardMeta = new Map<
    number,
    {
      name: string;
      typeLine: string | null;
      colorIdentity: string[];
      legalities: Record<string, string>;
    }
  >();
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

type PrefetchedRow = {
  id: string;
  cardId: number;
  zone: Zone;
  category: string | null;
  quantity: number;
};

function computeDeltas(
  changes: readonly PlannedChange[],
  existing: PrefetchedRow[],
  cardMeta: DeckSnapshot["cardMeta"],
): RevisionDelta[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const acc = new Map<string, RevisionDelta>();

  const bump = (
    cardId: number,
    zone: Zone,
    category: string | null,
    delta: number,
  ) => {
    const key = `${cardId}|${zone}|${category ?? ""}`;
    const prior = acc.get(key);
    if (prior) {
      prior.delta += delta;
    } else {
      acc.set(key, {
        cardId,
        cardName: cardMeta.get(cardId)?.name ?? "",
        zone,
        category,
        delta,
      });
    }
  };

  for (const change of changes) {
    if (change.op === "add") {
      bump(change.cardId, change.zone, change.category, change.quantity);
    } else if (change.op === "remove") {
      const row = byId.get(change.deckCardId);
      if (!row) continue;
      bump(row.cardId, row.zone, row.category, -row.quantity);
    } else if (change.op === "update") {
      const row = byId.get(change.deckCardId);
      if (!row) continue;
      const next = change.quantity <= 0 ? 0 : change.quantity;
      bump(row.cardId, row.zone, row.category, next - row.quantity);
    } else {
      const row = byId.get(change.deckCardId);
      if (!row) continue;
      if (row.zone === change.zone && row.category === change.category) continue;
      bump(row.cardId, row.zone, row.category, -row.quantity);
      bump(row.cardId, change.zone, change.category, row.quantity);
    }
  }

  return [...acc.values()].filter((d) => d.delta !== 0);
}

async function applyOps(
  tx: Prisma.TransactionClient,
  deckId: string,
  changes: readonly PlannedChange[],
  prefetched: Map<string, PrefetchedRow>,
): Promise<void> {
  for (const change of changes) {
    if (change.op === "add") {
      const printingId = change.printingId ?? null;
      const isFoil = change.isFoil ?? false;
      const existing = await tx.deckCard.findFirst({
        where: {
          deckId,
          cardId: change.cardId,
          zone: change.zone,
          category: change.category,
          printingId,
          isFoil,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.deckCard.update({
          where: { id: existing.id },
          data: { quantity: { increment: change.quantity } },
        });
      } else {
        await tx.deckCard.create({
          data: {
            deckId,
            cardId: change.cardId,
            quantity: change.quantity,
            zone: change.zone,
            category: change.category,
            printingId,
            isFoil,
          },
        });
      }
    } else if (change.op === "remove") {
      await tx.deckCard.delete({ where: { id: change.deckCardId } });
    } else if (change.op === "update") {
      if (change.quantity <= 0) {
        await tx.deckCard.delete({ where: { id: change.deckCardId } });
      } else {
        await tx.deckCard.update({
          where: { id: change.deckCardId },
          data: { quantity: change.quantity },
        });
      }
    } else {
      const row = prefetched.get(change.deckCardId);
      if (!row) {
        throw new Error("Not found or unauthorized");
      }
      const target = await tx.deckCard.findFirst({
        where: {
          deckId,
          cardId: row.cardId,
          zone: change.zone,
          category: change.category,
        },
        select: { id: true, quantity: true },
      });
      if (target && target.id !== change.deckCardId) {
        await tx.deckCard.update({
          where: { id: target.id },
          data: { quantity: { increment: row.quantity } },
        });
        await tx.deckCard.delete({ where: { id: change.deckCardId } });
      } else {
        await tx.deckCard.update({
          where: { id: change.deckCardId },
          data: { zone: change.zone, category: change.category },
        });
      }
    }
  }
}

function revisionTags(deckId: string): void {
  updateTag(`deck:${deckId}`);
  updateTag(`deck:${deckId}:revisions`);
}

export async function applyChanges(
  deckId: string,
  userId: string,
  changes: PlannedChange[],
  opts?: { skipRevision?: boolean },
): Promise<void> {
  if (changes.length === 0) return;

  const before = await loadSnapshot(deckId, changes);
  const projected = projectChanges(before, changes);
  // Invariant gating is wired up but currently disabled — write paths do not
  // hard-block on singleton/legality issues. Re-enable by uncommenting:
  //   const issues = checkInvariants(before, projected, changes);
  //   if (issues.length > 0) throw new InvariantViolation(issues);
  // Structural-only check (category-zone mismatch) still throws.
  const structural = checkStructural(changes);
  if (structural.length > 0) {
    throw new InvariantViolation(structural);
  }
  void projected;

  const prefetchedRows: PrefetchedRow[] = before.cards.map((c) => ({
    id: c.id,
    cardId: c.cardId,
    zone: c.zone,
    category: c.category,
    quantity: c.quantity,
  }));
  const prefetched = new Map(prefetchedRows.map((r) => [r.id, r]));

  for (const change of changes) {
    if ("deckCardId" in change && !prefetched.has(change.deckCardId)) {
      throw new Error("Not found or unauthorized");
    }
  }

  const deltas = opts?.skipRevision
    ? []
    : computeDeltas(changes, prefetchedRows, before.cardMeta);

  await prisma.$transaction(async (tx) => {
    await applyOps(tx, deckId, changes, prefetched);
    if (deltas.length > 0) {
      await recordDeckRevisionTx(tx, deckId, userId, deltas);
    }
  });

  revisionTags(deckId);
}
