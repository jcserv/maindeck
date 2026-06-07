import type { RevisionDelta } from "@/lib/deck/revision";
import type { DbOp } from "./diff-snapshots";
import { diffSnapshots } from "./diff-snapshots";
import { checkStructural, projectChanges } from "./invariants";
import type { DeckSnapshot, LegalityIssue, PlannedChange } from "./types";

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
  const structural = checkStructural(changes);

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
