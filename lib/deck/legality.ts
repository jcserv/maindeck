import {
  getCardLegalityForDeck,
  viewDeckLegality,
  type DeckLegalityView,
  type LegalityIssue,
} from "./mutation";

export type { LegalityIssue };
export type DeckLegality = DeckLegalityView;

export const validateDeck = viewDeckLegality;
export { getCardLegalityForDeck };
