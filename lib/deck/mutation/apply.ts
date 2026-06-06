import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RevisionDelta } from "@/lib/deck/revision";
import {
  deckCardMutationTags,
  invalidateTags,
} from "@/lib/deck/cache-tags";
import type { DbOp } from "./diff-snapshots";
import { diffSnapshots } from "./diff-snapshots";
import { StructuralViolation } from "./errors";
import { loadSnapshotForDeck } from "./snapshot";
import { previewChanges } from "./preview";
import { recordDeckRevisionTx } from "./revision";
import type { DeckSnapshot, PlannedChange } from "./types";

/**
 * Revision deltas are the net per-(card, zone, category) quantity change between
 * the before snapshot and the projected after snapshot — the *same* projection
 * the DB writes come from, so the audit trail can never disagree with what was
 * actually written.
 */
function computeDeltas(
  before: DeckSnapshot,
  after: DeckSnapshot,
): RevisionDelta[] {
  const acc = new Map<string, RevisionDelta>();

  const bump = (
    cardId: number,
    cardName: string,
    zone: DeckSnapshot["cards"][number]["zone"],
    category: string | null,
    delta: number,
  ) => {
    const key = `${cardId}|${zone}|${category ?? ""}`;
    const prior = acc.get(key);
    if (prior) {
      prior.delta += delta;
    } else {
      acc.set(key, { cardId, cardName, zone, category, delta });
    }
  };

  for (const c of before.cards) {
    bump(c.cardId, c.cardName, c.zone, c.category, -c.quantity);
  }
  for (const c of after.cards) {
    bump(c.cardId, c.cardName, c.zone, c.category, c.quantity);
  }

  return [...acc.values()].filter((d) => d.delta !== 0);
}

async function applyOps(
  tx: Prisma.TransactionClient,
  deckId: string,
  ops: readonly DbOp[],
): Promise<void> {
  for (const op of ops) {
    if (op.kind === "create") {
      await tx.deckCard.create({
        data: {
          deckId,
          cardId: op.cardId,
          quantity: op.quantity,
          zone: op.zone,
          category: op.category,
          printingId: op.printingId,
          isFoil: op.isFoil,
        },
      });
    } else if (op.kind === "delete") {
      await tx.deckCard.delete({ where: { id: op.deckCardId } });
    } else {
      const data: Prisma.DeckCardUpdateInput = {};
      if (op.quantity !== undefined) data.quantity = op.quantity;
      if (op.zone !== undefined) data.zone = op.zone;
      if ("category" in op) data.category = op.category;
      await tx.deckCard.update({ where: { id: op.deckCardId }, data });
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
  opts?: {
    skipRevision?: boolean;
    skipCacheInvalidation?: boolean;
    /**
     * Force a fresh `DeckRevision` row instead of merging into the latest one
     * within the 5-min window. Used by revert so the audit trail always shows
     * the inverse, even when it would cancel a recent edit to net zero.
     */
    skipMerge?: boolean;
  },
): Promise<void> {
  if (changes.length === 0) return;

  // The write plan is built from this pre-transaction snapshot rather than from
  // in-tx re-reads. Single-owner decks make the staleness window negligible; we
  // trade the old per-op `findFirst` requery for one consistent projection.
  const before = await loadSnapshotForDeck(deckId, changes);
  const { structural, projected } = previewChanges(before, changes);
  // Legality gating is wired up but currently disabled — write paths do not
  // hard-block on singleton/legality issues. Re-enable by branching on
  // previewChanges(...).legality. Structural-only check still throws.
  if (structural.length > 0) {
    throw new StructuralViolation(structural);
  }

  const beforeIds = new Set(before.cards.map((c) => c.id));
  for (const change of changes) {
    if ("deckCardId" in change && !beforeIds.has(change.deckCardId)) {
      throw new Error("Not found or unauthorized");
    }
  }

  const ops = diffSnapshots(before, projected);
  const deltas = opts?.skipRevision ? [] : computeDeltas(before, projected);

  await prisma.$transaction(async (tx) => {
    await applyOps(tx, deckId, ops);
    if (deltas.length > 0) {
      await recordDeckRevisionTx(
        tx,
        deckId,
        userId,
        deltas,
        opts?.skipMerge ? { skipMerge: true } : undefined,
      );
    }
  });

  // Bulk callers (workflows) skip per-deck invalidation and fan out
  // a single `revalidateTag` at the end. `updateTag` is also unsafe
  // outside a Server Action context.
  if (!opts?.skipCacheInvalidation) {
    revisionTags(deckId);
  }
}
