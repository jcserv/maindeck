import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  deckCardMutationTags,
  invalidateTags,
} from "@/lib/deck/cache-tags";
import type { DbOp } from "./diff-snapshots";
import { StructuralViolation } from "./errors";
import { planMutation } from "./plan";
import { loadSnapshotForDeck } from "./snapshot";
import { recordDeckRevisionTx } from "./revision";
import type { PlannedChange } from "./types";

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
    /**
     * Run against the caller's own transaction instead of opening a new one.
     * Postgres/Prisma don't support nesting real transactions, so callers that
     * already hold a `tx` (e.g. proposal approval, which needs the plan and
     * the apply to commit or roll back together) must pass it through here.
     */
    tx?: Prisma.TransactionClient;
  },
): Promise<void> {
  if (changes.length === 0) return;

  // The write plan is built from this pre-transaction snapshot rather than from
  // in-tx re-reads. Single-owner decks make the staleness window negligible; we
  // trade the old per-op `findFirst` requery for one consistent projection.
  const before = await loadSnapshotForDeck(deckId, changes, opts?.tx);
  const { ops, deltas, structural, missingDeckCardId } = planMutation(
    before,
    changes,
    { skipRevision: opts?.skipRevision ?? false },
  );

  if (structural.length > 0) {
    throw new StructuralViolation(structural);
  }
  if (missingDeckCardId !== null) {
    throw new Error("Not found or unauthorized");
  }

  const run = async (tx: Prisma.TransactionClient) => {
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
  };

  if (opts?.tx) {
    await run(opts.tx);
  } else {
    await prisma.$transaction(run);
  }

  // Bulk callers (workflows) skip per-deck invalidation and fan out
  // a single `revalidateTag` at the end. `updateTag` is also unsafe
  // outside a Server Action context.
  if (!opts?.skipCacheInvalidation) {
    revisionTags(deckId);
  }
}
