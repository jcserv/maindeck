import { checkStructural, projectChanges } from "./invariants";
import type { DeckSnapshot, LegalityIssue, PlannedChange } from "./types";

type PreviewResult = {
  structural: LegalityIssue[];
  projected: DeckSnapshot;
};

/**
 * Pure: project the changes onto the snapshot and return the projected deck
 * plus any structural issues introduced by the changes.
 */
export function previewChanges(
  before: DeckSnapshot,
  changes: readonly PlannedChange[],
): PreviewResult {
  const projected = projectChanges(before, changes);
  const structural = checkStructural(changes);
  return { structural, projected };
}
