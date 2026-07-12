"use server";

import { prisma } from "@/lib/db";
import { requireDeckViewable } from "@/lib/auth/deck-access";
import { applyChanges, runOwnerDeckMutation } from "@/lib/deck/mutation";
import {
  deltaKey,
  deltasToBulkChanges,
  invertDeltas,
  parseRevisionDeltas,
  type RevisionDelta,
} from "@/lib/deck/revision";

function filterDeltas(
  deltas: RevisionDelta[],
  deltaKeys: string[] | undefined,
): RevisionDelta[] {
  if (deltaKeys === undefined) return deltas;
  if (!Array.isArray(deltaKeys)) return [];
  const allowed = new Set(deltaKeys.filter((k): k is string => typeof k === "string"));
  if (allowed.size === 0) return [];
  return deltas.filter((d) => allowed.has(deltaKey(d)));
}

export type RevisionView = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  changes: RevisionDelta[];
};

export async function listDeckRevisions(
  deckId: string,
): Promise<RevisionView[]> {
  await requireDeckViewable(deckId);

  const rows = await prisma.deckRevision.findMany({
    where: { deckId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, createdAt: true, updatedAt: true, changes: true },
  });

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    changes: parseRevisionDeltas(r.changes),
  }));
}

export const revertDeckRevision = runOwnerDeckMutation(
  "deck.revertRevision",
  "none",
  async (
    { deckId, userId },
    revisionId: string,
    deltaKeys?: string[],
  ): Promise<void> => {
    const revision = await prisma.deckRevision.findUnique({
      where: { id: revisionId },
      select: { deckId: true, changes: true },
    });

    if (!revision || revision.deckId !== deckId) {
      throw new Error("Not found or unauthorized");
    }

    const allDeltas = parseRevisionDeltas(revision.changes);
    const deltas = filterDeltas(allDeltas, deltaKeys);
    if (deltas.length === 0) return;

    const inverted = invertDeltas(deltas);

    const [rows, categories] = await Promise.all([
      prisma.deckCard.findMany({
        where: { deckId },
        select: {
          id: true,
          cardId: true,
          zone: true,
          quantity: true,
        },
      }),
      prisma.deckCategory.findMany({
        where: { deckId },
        select: { name: true },
      }),
    ]);

    const existing = rows.map((r) => ({
      deckCardId: r.id,
      cardId: r.cardId,
      zone: r.zone,
      quantity: r.quantity,
    }));

    const changes = deltasToBulkChanges(
      inverted,
      existing,
      new Set(categories.map((c) => c.name)),
    );
    if (changes.length === 0) return;

    await applyChanges(deckId, userId, changes, { skipMerge: true });
  },
);
