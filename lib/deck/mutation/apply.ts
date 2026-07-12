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

/**
 * Resolve the category names referenced by `ops` to `DeckCategory` ids in one
 * query. Structural validation already rejected unknown names against the
 * snapshot, so a miss here means the category was deleted mid-flight — throw
 * rather than silently drop a membership.
 */
async function resolveCategoryIds(
  tx: Prisma.TransactionClient,
  deckId: string,
  ops: readonly DbOp[],
): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const op of ops) {
    if (op.kind === "create" || op.kind === "update") {
      for (const name of op.categories ?? []) names.add(name);
    }
  }
  if (names.size === 0) return new Map();

  const rows = await tx.deckCategory.findMany({
    where: { deckId, name: { in: [...names] } },
    select: { id: true, name: true },
  });
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  for (const name of names) {
    if (!byName.has(name)) {
      throw new Error(`Category "${name}" not found in deck`);
    }
  }
  return byName;
}

/**
 * Replace a row's memberships wholesale. Delete-then-create renumbers
 * positions 0..n-1, so the write is idempotent and position gaps left by
 * cascade deletes never accumulate.
 */
async function replaceCategoryLinks(
  tx: Prisma.TransactionClient,
  deckCardId: string,
  categories: readonly string[],
  categoryIdByName: Map<string, string>,
): Promise<void> {
  await tx.deckCardCategory.deleteMany({ where: { deckCardId } });
  if (categories.length === 0) return;
  await tx.deckCardCategory.createMany({
    data: categories.map((name, position) => ({
      deckCardId,
      deckCategoryId: categoryIdByName.get(name)!,
      position,
    })),
  });
}

async function applyOps(
  tx: Prisma.TransactionClient,
  deckId: string,
  ops: readonly DbOp[],
): Promise<void> {
  const categoryIdByName = await resolveCategoryIds(tx, deckId, ops);

  for (const op of ops) {
    if (op.kind === "create") {
      const created = await tx.deckCard.create({
        data: {
          deckId,
          cardId: op.cardId,
          quantity: op.quantity,
          zone: op.zone,
          printingId: op.printingId,
          isFoil: op.isFoil,
        },
        select: { id: true },
      });
      if (op.categories.length > 0) {
        await replaceCategoryLinks(
          tx,
          created.id,
          op.categories,
          categoryIdByName,
        );
      }
    } else if (op.kind === "delete") {
      await tx.deckCard.delete({ where: { id: op.deckCardId } });
    } else {
      const data: Prisma.DeckCardUpdateInput = {};
      if (op.quantity !== undefined) data.quantity = op.quantity;
      if (op.zone !== undefined) data.zone = op.zone;
      // A category-only update still touches the row so `@updatedAt` reflects
      // the membership change (the links live on a separate table).
      if (
        op.quantity !== undefined ||
        op.zone !== undefined ||
        op.categories !== undefined
      ) {
        await tx.deckCard.update({ where: { id: op.deckCardId }, data });
      }
      if (op.categories !== undefined) {
        await replaceCategoryLinks(
          tx,
          op.deckCardId,
          op.categories,
          categoryIdByName,
        );
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
