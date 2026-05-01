export { applyChanges } from "./apply";
export {
  InvariantViolation,
  StructuralViolation,
  LegalityViolation,
} from "./errors";
export { diffDeck, type ExistingDeckCard } from "./diff";
export {
  loadSnapshotForDeck,
  snapshotFromDeck,
  snapshotFromCards,
  previewChanges,
  type PreviewResult,
  type SnapshotFromCardsInput,
} from "./snapshot";
export type { PlannedChange, LegalityIssue, DeckSnapshot, SnapshotCard } from "./types";
