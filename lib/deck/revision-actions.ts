"use server";

import { prisma } from "@/lib/db";
import {
  requireDeckOwner,
  requireDeckViewable,
} from "@/lib/auth/deck-access";
import { bulkUpdateDeck } from "@/lib/deck/editor-actions";
import {
  deltasToBulkChanges,
  invertDeltas,
  type RevisionDelta,
} from "@/lib/deck/revision";

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
    changes: (r.changes as unknown as RevisionDelta[]) ?? [],
  }));
}

export async function revertDeckRevision(
  deckId: string,
  revisionId: string,
): Promise<void> {
  await requireDeckOwner(deckId);

  const revision = await prisma.deckRevision.findUnique({
    where: { id: revisionId },
    select: { deckId: true, changes: true },
  });

  if (!revision || revision.deckId !== deckId) {
    throw new Error("Not found or unauthorized");
  }

  const deltas = (revision.changes as unknown as RevisionDelta[]) ?? [];
  const inverted = invertDeltas(deltas);

  const rows = await prisma.deckCard.findMany({
    where: { deckId },
    select: {
      id: true,
      cardId: true,
      zone: true,
      category: true,
      quantity: true,
    },
  });

  const existing = rows.map((r) => ({
    deckCardId: r.id,
    cardId: r.cardId,
    zone: r.zone,
    category: r.category,
    quantity: r.quantity,
  }));

  const changes = deltasToBulkChanges(inverted, existing);
  if (changes.length === 0) return;

  await bulkUpdateDeck(deckId, changes);
}
