import { z } from "zod";
import { Zone } from "@/lib/generated/prisma/enums";
import type { BulkChange } from "@/lib/deck/editor-actions";
import type { ExistingDeckCard } from "@/lib/deck/mutation/diff";
import { logWarn } from "@/lib/telemetry";

const revisionDeltaSchema = z.object({
  cardId: z.number().int(),
  cardName: z.string(),
  zone: z.enum(Zone),
  category: z.string().nullable(),
  delta: z.number().int(),
});

export type RevisionDelta = z.infer<typeof revisionDeltaSchema>;

export function parseRevisionDeltas(input: unknown): RevisionDelta[] {
  const result = z.array(revisionDeltaSchema).safeParse(input);
  if (!result.success) {
    logWarn(
      { source: "deck.revision.parse", issues: result.error.issues },
      "malformed revision payload",
    );
    return [];
  }
  return result.data;
}

export const REVISION_WINDOW_MS = 5 * 60 * 1000;

function deltaKey(d: Pick<RevisionDelta, "cardId" | "zone" | "category">): string {
  return `${d.cardId}|${d.zone}|${d.category ?? ""}`;
}

export function mergeDeltas(
  existing: readonly RevisionDelta[],
  incoming: readonly RevisionDelta[],
): RevisionDelta[] {
  const byKey = new Map<string, RevisionDelta>();
  for (const d of existing) {
    byKey.set(deltaKey(d), { ...d });
  }
  for (const d of incoming) {
    const key = deltaKey(d);
    const prior = byKey.get(key);
    if (prior) {
      prior.delta += d.delta;
      prior.cardName = d.cardName;
    } else {
      byKey.set(key, { ...d });
    }
  }
  return [...byKey.values()].filter((d) => d.delta !== 0);
}

export function invertDeltas(deltas: readonly RevisionDelta[]): RevisionDelta[] {
  return deltas.map((d) => ({ ...d, delta: -d.delta }));
}

/**
 * Translate revert deltas into BulkChange operations against current deck rows.
 * Negative deltas cap at the current quantity so a double-revert doesn't throw
 * after the user has manually removed cards.
 */
export function deltasToBulkChanges(
  deltas: readonly RevisionDelta[],
  existing: readonly ExistingDeckCard[],
): BulkChange[] {
  const existingByKey = new Map<string, ExistingDeckCard>();
  for (const e of existing) {
    existingByKey.set(
      `${e.cardId}|${e.zone}|${e.category ?? ""}`,
      e,
    );
  }

  const changes: BulkChange[] = [];
  for (const d of deltas) {
    if (d.delta === 0) continue;
    const key = deltaKey(d);
    const row = existingByKey.get(key);

    if (d.delta > 0) {
      if (row) {
        changes.push({
          op: "update",
          deckCardId: row.deckCardId,
          quantity: row.quantity + d.delta,
        });
      } else {
        changes.push({
          op: "add",
          cardId: d.cardId,
          quantity: d.delta,
          zone: d.zone,
          category: d.category,
        });
      }
    } else {
      if (!row) continue;
      const next = row.quantity + d.delta;
      if (next <= 0) {
        changes.push({ op: "remove", deckCardId: row.deckCardId });
      } else {
        changes.push({
          op: "update",
          deckCardId: row.deckCardId,
          quantity: next,
        });
      }
    }
  }
  return changes;
}
