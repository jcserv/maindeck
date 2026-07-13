import type { RevisionDelta } from "@/lib/deck/revision";
import type { DbOp } from "./diff-snapshots";
import { diffSnapshots, sameCategories } from "./diff-snapshots";
import { checkStructural, projectChanges } from "./invariants";
import type { DeckSnapshot, LegalityIssue, PlannedChange } from "./types";

/**
 * Revision deltas are the net per-(card, zone) quantity change between the
 * before snapshot and the projected after snapshot — the *same* projection
 * the DB writes come from, so the audit trail can never disagree with what was
 * actually written. Each delta carries the after-side memberships (falling
 * back to the before-side for pure removals) so a revert can restore them.
 * When an edit changes memberships without changing quantity, a zero-delta
 * entry with `previousCategories` records the recategorization.
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
    categories: readonly string[],
    delta: number,
    fromAfter: boolean,
  ) => {
    const key = `${cardId}|${zone}`;
    const prior = acc.get(key);
    if (prior) {
      prior.delta += delta;
      if (fromAfter) prior.categories = [...categories];
    } else {
      acc.set(key, {
        cardId,
        cardName,
        zone,
        categories: [...categories],
        // Only before-side rows have a before-state; a pure add has none.
        ...(fromAfter ? {} : { previousCategories: [...categories] }),
        delta,
      });
    }
  };

  for (const c of before.cards) {
    bump(c.cardId, c.cardName, c.zone, c.categories, -c.quantity, false);
  }
  for (const c of after.cards) {
    bump(c.cardId, c.cardName, c.zone, c.categories, c.quantity, true);
  }

  return [...acc.values()]
    .map((d): RevisionDelta => {
      if (
        d.previousCategories !== undefined &&
        sameCategories(d.categories, d.previousCategories)
      ) {
        const { previousCategories: _omit, ...rest } = d;
        return rest;
      }
      return d;
    })
    .filter((d) => d.delta !== 0 || d.previousCategories !== undefined);
}

/**
 * The pure write plan for a mutation: the DB ops to apply, the revision deltas
 * to record, the structural issues that must hard-block, and the first change
 * referencing a `deckCardId` not on the deck (or null). Contains no `prisma`,
 * `next/cache`, or `server-only` dependency, so the opts matrix and op kinds can
 * be exercised as pure data — `apply.ts` owns turning this into DB writes.
 */
type MutationPlan = {
  ops: DbOp[];
  deltas: RevisionDelta[];
  structural: LegalityIssue[];
  missingDeckCardId: string | null;
};

export function planMutation(
  before: DeckSnapshot,
  changes: readonly PlannedChange[],
  opts?: { skipRevision?: boolean },
): MutationPlan {
  const projected = projectChanges(before, changes);
  const structural = checkStructural(changes, before.categoryNames);

  const beforeIds = new Set(before.cards.map((c) => c.id));
  let missingDeckCardId: string | null = null;
  for (const change of changes) {
    if ("deckCardId" in change && !beforeIds.has(change.deckCardId)) {
      missingDeckCardId = change.deckCardId;
      break;
    }
  }

  const ops = diffSnapshots(before, projected);
  const deltas = opts?.skipRevision ? [] : computeDeltas(before, projected);

  return { ops, deltas, structural, missingDeckCardId };
}
