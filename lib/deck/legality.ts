import { Format } from "@/lib/generated/prisma/enums";
import type { Deck } from "@/lib/deck/zone-view";
import {
  fullLegality,
  checkSingleCard,
} from "./mutation/legality-rules";
import { snapshotFromDeck } from "./mutation/snapshot";
import type { LegalityIssue } from "./mutation/types";

export type { LegalityIssue };
export type DeckLegality = { legal: boolean; issues: LegalityIssue[] };

export function validateDeck(deck: Deck): DeckLegality {
  const snap = snapshotFromDeck(deck);
  const issues = fullLegality(snap);
  return { legal: issues.length === 0, issues };
}

export function getCardLegalityForDeck(args: {
  card: {
    name: string;
    legalities: Record<string, string>;
    typeLine?: string | null;
    colorIdentity?: string[];
  };
  format: Format;
  currentCopiesInDeck: number;
  addingQuantity?: number;
  commanderIdentity?: string[];
}): { legal: boolean; reasons: string[] } {
  return checkSingleCard(args);
}
