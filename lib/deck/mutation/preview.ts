import { fullLegality } from "@/lib/deck/legality";
import { formatLegalityIssue } from "@/lib/deck/legality/shared";
import { checkStructural, projectChanges } from "./invariants";
import type { DeckSnapshot, LegalityIssue, PlannedChange } from "./types";

type PreviewResult = {
  structural: LegalityIssue[];
  legality: LegalityIssue[];
  projected: DeckSnapshot;
};

/**
 * Pure: project the changes onto the snapshot and return structural and
 * legality issues for the projected deck.
 *
 * Callers can decide which (if any) issues to gate on.
 */
export function previewChanges(
  before: DeckSnapshot,
  changes: readonly PlannedChange[],
): PreviewResult {
  const projected = projectChanges(before, changes);
  const structural = checkStructural(changes);
  const beforeMessages = new Set(fullLegality(before).map(formatLegalityIssue));
  const legality = fullLegality(projected).filter(
    (i) => !beforeMessages.has(formatLegalityIssue(i)),
  );
  return { structural, legality, projected };
}
