"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requireDeckOwner } from "@/lib/auth/deck-access";
import { Format, Zone } from "@/lib/generated/prisma/client";
import { isBasicLand } from "@/lib/deck/zone-view";
import { recordDeckRevision } from "@/lib/deck/revision-recorder";
import type { RevisionDelta } from "@/lib/deck/revision";

function revisionTags(deckId: string): void {
  updateTag(`deck:${deckId}`);
  updateTag(`deck:${deckId}:revisions`);
}

async function cardNames(cardIds: number[]): Promise<Map<number, string>> {
  const rows = await prisma.card.findMany({
    where: { id: { in: [...new Set(cardIds)] } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function addCardToDeck(
  deckId: string,
  cardId: number,
  opts?: { quantity?: number; zone?: Zone; category?: string | null },
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

  const quantity = opts?.quantity ?? 1;
  const zone = opts?.zone ?? Zone.MAINBOARD;
  const category = opts?.category ?? null;

  if (category !== null && zone !== Zone.MAINBOARD) {
    throw new Error("Subcategories only apply to MAINBOARD cards");
  }

  const existing = await prisma.deckCard.findFirst({
    where: { deckId, cardId, zone, category },
    select: { id: true },
  });

  let effectiveDelta = quantity;

  if (existing) {
    const row = await prisma.deck.findUnique({
      where: { id: deckId },
      select: {
        format: true,
        cards: {
          where: { cardId },
          select: { card: { select: { typeLine: true } } },
          take: 1,
        },
      },
    });
    const typeLine = row?.cards?.[0]?.card.typeLine ?? null;
    const singleton =
      row?.format === Format.COMMANDER && !isBasicLand(typeLine);
    if (singleton) return;

    await prisma.deckCard.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } },
    });
  } else {
    await prisma.deckCard.create({
      data: { deckId, cardId, quantity, zone, category },
    });
    effectiveDelta = quantity;
  }

  const names = await cardNames([cardId]);
  await recordDeckRevision(deckId, userId, [
    {
      cardId,
      cardName: names.get(cardId) ?? "",
      zone,
      category,
      delta: effectiveDelta,
    },
  ]);

  revisionTags(deckId);
}

export async function removeCardFromDeck(
  deckId: string,
  deckCardId: string,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

  const deckCard = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    select: {
      deckId: true,
      cardId: true,
      quantity: true,
      zone: true,
      category: true,
    },
  });

  if (!deckCard || deckCard.deckId !== deckId) {
    throw new Error("Not found or unauthorized");
  }

  await prisma.deckCard.delete({ where: { id: deckCardId } });

  const names = await cardNames([deckCard.cardId]);
  await recordDeckRevision(deckId, userId, [
    {
      cardId: deckCard.cardId,
      cardName: names.get(deckCard.cardId) ?? "",
      zone: deckCard.zone,
      category: deckCard.category,
      delta: -deckCard.quantity,
    },
  ]);

  revisionTags(deckId);
}

export async function updateCardQuantity(
  deckId: string,
  deckCardId: string,
  quantity: number,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

  const deckCard = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    select: {
      deckId: true,
      cardId: true,
      quantity: true,
      zone: true,
      category: true,
    },
  });

  if (!deckCard || deckCard.deckId !== deckId) {
    throw new Error("Not found or unauthorized");
  }

  const oldQuantity = deckCard.quantity;
  const newQuantity = quantity <= 0 ? 0 : quantity;

  if (newQuantity === oldQuantity) return;

  if (newQuantity === 0) {
    await prisma.deckCard.delete({ where: { id: deckCardId } });
  } else {
    await prisma.deckCard.update({
      where: { id: deckCardId },
      data: { quantity: newQuantity },
    });
  }

  const names = await cardNames([deckCard.cardId]);
  await recordDeckRevision(deckId, userId, [
    {
      cardId: deckCard.cardId,
      cardName: names.get(deckCard.cardId) ?? "",
      zone: deckCard.zone,
      category: deckCard.category,
      delta: newQuantity - oldQuantity,
    },
  ]);

  revisionTags(deckId);
}

export type BulkChange =
  | {
      op: "add";
      cardId: number;
      quantity: number;
      zone: Zone;
      category: string | null;
    }
  | { op: "remove"; deckCardId: string }
  | { op: "update"; deckCardId: string; quantity: number }
  | {
      op: "move";
      deckCardId: string;
      zone: Zone;
      category: string | null;
    };

export async function bulkUpdateDeck(
  deckId: string,
  changes: BulkChange[],
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

  const referencedIds = changes
    .filter(
      (c): c is Extract<BulkChange, { deckCardId: string }> =>
        "deckCardId" in c,
    )
    .map((c) => c.deckCardId);

  const existingCards =
    referencedIds.length > 0
      ? await prisma.deckCard.findMany({
          where: { id: { in: referencedIds }, deckId },
          select: {
            id: true,
            cardId: true,
            zone: true,
            category: true,
            quantity: true,
          },
        })
      : [];

  const cardById = new Map(existingCards.map((c) => [c.id, c]));

  for (const id of referencedIds) {
    if (!cardById.has(id)) {
      throw new Error("Not found or unauthorized");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      if (change.op === "add") {
        if (change.category !== null && change.zone !== Zone.MAINBOARD) {
          throw new Error("Subcategories only apply to MAINBOARD cards");
        }
        const existing = await tx.deckCard.findFirst({
          where: {
            deckId,
            cardId: change.cardId,
            zone: change.zone,
            category: change.category,
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
        const card = cardById.get(change.deckCardId)!;

        const target = await tx.deckCard.findFirst({
          where: {
            deckId,
            cardId: card.cardId,
            zone: change.zone,
            category: change.category,
          },
          select: { id: true, quantity: true },
        });

        if (target && target.id !== change.deckCardId) {
          await tx.deckCard.update({
            where: { id: target.id },
            data: { quantity: { increment: card.quantity } },
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
  });

  const deltas = computeBulkDeltas(changes, existingCards);
  if (deltas.length > 0) {
    const names = await cardNames(deltas.map((d) => d.cardId));
    const named = deltas.map((d) => ({
      ...d,
      cardName: names.get(d.cardId) ?? "",
    }));
    await recordDeckRevision(deckId, userId, named);
  }

  revisionTags(deckId);
}

type PrefetchedCard = {
  id: string;
  cardId: number;
  zone: Zone;
  category: string | null;
  quantity: number;
};

/**
 * Compute net per-(cardId,zone,category) deltas from a completed bulk edit.
 * `cardName` is filled in later by the caller so we only look up names once.
 */
function computeBulkDeltas(
  changes: BulkChange[],
  existing: PrefetchedCard[],
): Omit<RevisionDelta, "cardName">[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const acc = new Map<string, Omit<RevisionDelta, "cardName">>();

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
      acc.set(key, { cardId, zone, category, delta });
    }
  };

  for (const change of changes) {
    if (change.op === "add") {
      bump(change.cardId, change.zone, change.category, change.quantity);
    } else if (change.op === "remove") {
      const row = byId.get(change.deckCardId)!;
      bump(row.cardId, row.zone, row.category, -row.quantity);
    } else if (change.op === "update") {
      const row = byId.get(change.deckCardId)!;
      const next = change.quantity <= 0 ? 0 : change.quantity;
      bump(row.cardId, row.zone, row.category, next - row.quantity);
    } else {
      const row = byId.get(change.deckCardId)!;
      if (row.zone === change.zone && row.category === change.category) continue;
      bump(row.cardId, row.zone, row.category, -row.quantity);
      bump(row.cardId, change.zone, change.category, row.quantity);
    }
  }

  return [...acc.values()].filter((d) => d.delta !== 0);
}
