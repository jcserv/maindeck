import type { Zone } from "@/lib/generated/prisma/enums";
import type { DeckSnapshot } from "./types";

/**
 * A single DeckCard write derived from a before→after snapshot diff. A dumb
 * translation target: `applyOps` maps each variant straight onto a Prisma call,
 * with no further rule logic.
 */
export type DbOp =
  | {
      kind: "create";
      cardId: number;
      quantity: number;
      zone: Zone;
      /** Ordered category memberships; `[0]` is the primary. */
      categories: string[];
      printingId: number | null;
      isFoil: boolean;
    }
  | { kind: "delete"; deckCardId: string }
  | {
      kind: "update";
      deckCardId: string;
      quantity?: number;
      zone?: Zone;
      /** When present, replaces the row's memberships wholesale. */
      categories?: string[];
    };

function sameCategories(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

/**
 * Structural diff of two snapshots keyed by `SnapshotCard.id`:
 *
 * - row flagged `isNew` in `after`               → create
 * - id in `before` but gone from `after`         → delete
 * - same id, quantity/zone/categories changed    → update (only changed fields)
 *
 * Because `projectChanges` already merged add/move targets into existing rows,
 * those merges surface here as plain quantity/zone updates plus a delete of the
 * drained source — no special-casing needed.
 */
export function diffSnapshots(
  before: DeckSnapshot,
  after: DeckSnapshot,
): DbOp[] {
  const beforeById = new Map(before.cards.map((c) => [c.id, c]));
  const afterIds = new Set(after.cards.map((c) => c.id));
  const ops: DbOp[] = [];

  for (const a of after.cards) {
    if (a.isNew) {
      ops.push({
        kind: "create",
        cardId: a.cardId,
        quantity: a.quantity,
        zone: a.zone,
        categories: [...a.categories],
        printingId: a.printingId ?? null,
        isFoil: a.isFoil,
      });
      continue;
    }
    const b = beforeById.get(a.id);
    /* c8 ignore next */
    if (!b) continue;
    const op: Extract<DbOp, { kind: "update" }> = {
      kind: "update",
      deckCardId: a.id,
    };
    let changed = false;
    if (a.quantity !== b.quantity) {
      op.quantity = a.quantity;
      changed = true;
    }
    if (a.zone !== b.zone) {
      op.zone = a.zone;
      changed = true;
    }
    if (!sameCategories(a.categories, b.categories)) {
      op.categories = [...a.categories];
      changed = true;
    }
    if (changed) ops.push(op);
  }

  for (const b of before.cards) {
    if (!afterIds.has(b.id)) {
      ops.push({ kind: "delete", deckCardId: b.id });
    }
  }

  return ops;
}
