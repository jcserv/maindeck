import { z } from "zod";
import { Zone } from "@/lib/generated/prisma/enums";
import type { BulkChange } from "@/lib/deck/editor-actions";
import type { ExistingDeckCard } from "@/lib/deck/mutation/diff";
import { logWarn } from "@/lib/telemetry";

const modernRevisionDeltaSchema = z.object({
  cardId: z.number().int(),
  cardName: z.string(),
  zone: z.enum(Zone),
  /** Ordered after-state category memberships; `[0]` is the primary. */
  categories: z.array(z.string()),
  /**
   * Before-state memberships, present only when the edit changed them — a
   * zero-delta entry with this set records a pure recategorization.
   * `invertDeltas` swaps this with `categories` so an inverted delta is still
   * "apply `categories`".
   */
  previousCategories: z.array(z.string()).optional(),
  delta: z.number().int(),
});

/**
 * Pre-multi-category payloads (stored in `DeckRevision.changes` and
 * `DeckProposal.changes`) carried a single nullable `category` string.
 * Normalize them to the modern shape on read.
 */
const legacyRevisionDeltaSchema = z
  .object({
    cardId: z.number().int(),
    cardName: z.string(),
    zone: z.enum(Zone),
    category: z.string().nullable(),
    delta: z.number().int(),
  })
  .transform(({ category, ...rest }) => ({
    ...rest,
    categories: category === null ? [] : [category],
  }));

export const revisionDeltaSchema = z.union([
  modernRevisionDeltaSchema,
  legacyRevisionDeltaSchema,
]);

export type RevisionDelta = z.infer<typeof modernRevisionDeltaSchema>;

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

export function deltaKey(d: Pick<RevisionDelta, "cardId" | "zone">): string {
  return `${d.cardId}|${d.zone}`;
}

function sameCategories(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

/** Drop `previousCategories` when it no longer records a real change. */
function normalizeDelta(d: RevisionDelta): RevisionDelta {
  if (
    d.previousCategories !== undefined &&
    sameCategories(d.categories, d.previousCategories)
  ) {
    const { previousCategories: _omit, ...rest } = d;
    return rest;
  }
  return d;
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
      // Keep the earliest before-state so a merged revision still describes
      // original → final.
      if (prior.previousCategories === undefined) {
        prior.previousCategories = d.previousCategories;
      }
      prior.categories = d.categories;
    } else {
      byKey.set(key, { ...d });
    }
  }
  return [...byKey.values()]
    .map(normalizeDelta)
    .filter((d) => d.delta !== 0 || d.previousCategories !== undefined);
}

/**
 * Net deltas by `(cardId, zone)` key for rendering. Legacy per-category
 * payloads can repeat a key, which breaks React list keys and double-counts.
 */
export function squashDeltas(
  deltas: readonly RevisionDelta[],
): RevisionDelta[] {
  return mergeDeltas([], deltas);
}

export interface DeltaSummary {
  added: number;
  removed: number;
  count: number;
}

export function summarizeDeltas(
  deltas: readonly RevisionDelta[],
): DeltaSummary {
  let added = 0;
  let removed = 0;
  for (const d of deltas) {
    if (d.delta > 0) added += d.delta;
    else removed -= d.delta;
  }
  return { added, removed, count: deltas.length };
}

export function invertDeltas(deltas: readonly RevisionDelta[]): RevisionDelta[] {
  return deltas.map((d) => {
    const delta = d.delta === 0 ? 0 : -d.delta;
    return d.previousCategories === undefined
      ? { ...d, delta }
      : {
          ...d,
          delta,
          categories: d.previousCategories,
          previousCategories: d.categories,
        };
  });
}

/**
 * Translate revert deltas into BulkChange operations against current deck rows.
 * Negative deltas cap at the current quantity so a double-revert doesn't throw
 * after the user has manually removed cards. Deltas are merged first so legacy
 * per-category payloads (which can repeat a `${cardId}|${zone}` key) net out
 * before conversion. `knownCategories` filters restored memberships to
 * categories that still exist in the deck.
 */
export function deltasToBulkChanges(
  deltas: readonly RevisionDelta[],
  existing: readonly ExistingDeckCard[],
  knownCategories: ReadonlySet<string>,
): BulkChange[] {
  const existingByKey = new Map<string, ExistingDeckCard>();
  for (const e of existing) {
    existingByKey.set(deltaKey(e), e);
  }

  const changes: BulkChange[] = [];
  for (const d of mergeDeltas([], deltas)) {
    const key = deltaKey(d);
    const row = existingByKey.get(key);
    const categories = d.categories.filter((name) => knownCategories.has(name));
    // A delta that changed memberships applies them to the surviving row;
    // the add path below carries them on the new row instead.
    const setCategories = (): void => {
      if (d.previousCategories === undefined) return;
      changes.push({
        op: "setCategories",
        cardId: d.cardId,
        zone: d.zone,
        categories,
      });
    };

    if (d.delta > 0) {
      if (row) {
        changes.push({
          op: "update",
          deckCardId: row.deckCardId,
          quantity: row.quantity + d.delta,
        });
        setCategories();
      } else {
        changes.push({
          op: "add",
          cardId: d.cardId,
          quantity: d.delta,
          zone: d.zone,
          categories,
        });
      }
    } else if (d.delta < 0) {
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
        setCategories();
      }
    } else {
      if (!row) continue;
      setCategories();
    }
  }
  return changes;
}
