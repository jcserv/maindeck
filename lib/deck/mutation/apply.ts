import "server-only";
import { prisma } from "@/lib/db";
import { Zone } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RevisionDelta } from "@/lib/deck/revision";
import {
  deckCardMutationTags,
  invalidateTags,
} from "@/lib/deck/cache-tags";
import { StructuralViolation } from "./errors";
import { loadSnapshotForDeck, previewChanges } from "./snapshot";
import { recordDeckRevisionTx } from "./revision";
import type { DeckSnapshot, PlannedChange } from "./types";

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
  invalidateTags(deckCardMutationTags({ deckId, withRevision: true }));
}

export async function applyChanges(
  deckId: string,
  userId: string,
  changes: PlannedChange[],
  opts?: { skipRevision?: boolean; skipCacheInvalidation?: boolean },
): Promise<void> {
  if (changes.length === 0) return;

  const before = await loadSnapshotForDeck(deckId, changes);
  const { structural } = previewChanges(before, changes);
  // Legality gating is wired up but currently disabled — write paths do not
  // hard-block on singleton/legality issues. Re-enable by branching on
  // previewChanges(...).legality. Structural-only check still throws.
  if (structural.length > 0) {
    throw new StructuralViolation(structural);
  }

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

  // Bulk callers (workflows) skip per-deck invalidation and fan out
  // a single `revalidateTag` at the end. `updateTag` is also unsafe
  // outside a Server Action context.
  if (!opts?.skipCacheInvalidation) {
    revisionTags(deckId);
  }
}
