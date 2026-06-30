import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Legalities } from "@/lib/card/types-meta";
import type { Deck } from "@/lib/deck/zone-view";
import { snapshotFromDeck } from "@/lib/deck/mutation/snapshot-pure";
import type {
  DeckSnapshot,
  LegalityIssue,
} from "@/lib/deck/mutation/types";
import { companionRule } from "./companions";
import { formatRules, isColorIdentityFormat, isSingletonFormat } from "./format-rules";
import {
  formatLegalityIssue,
  isBasicLandCard,
  legalityKindForStatus,
  offIdentityColors,
} from "./shared";

export type { LegalityIssue };
type DeckLegality = { legal: boolean; issues: LegalityIssue[] };

/**
 * Universal rule: every non-sideboard card must be legal in the deck's format
 * according to the per-card legalities map.
 */
function checkPerCardLegality(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const formatKey = snap.format.toLowerCase() as Lowercase<Format>;
  for (const dc of snap.cards) {
    if (dc.zone === Zone.SIDEBOARD || dc.zone === Zone.CONSIDERING) continue;
    const status = dc.legalities[formatKey];
    if (status && status !== "legal") {
      const kind = legalityKindForStatus(status);
      if (kind) {
        issues.push({ kind, cardName: dc.cardName });
      }
    }
  }
  return issues;
}

/**
 * Dispatcher: applies the universal per-card check plus the per-format rule
 * list registered for `snap.format`.
 */
export function fullLegality(snap: DeckSnapshot): LegalityIssue[] {
  const perFormat = formatRules[snap.format].flatMap((rule) => rule(snap));
  return [...checkPerCardLegality(snap), ...perFormat, ...companionRule(snap)];
}

export function validateDeck(deck: Deck): DeckLegality {
  const snap = snapshotFromDeck(deck);
  const issues = fullLegality(snap);
  return { legal: issues.length === 0, issues };
}

function checkSingleCard(args: {
  card: {
    name: string;
    legalities: Legalities;
    typeLine?: string | null;
    colorIdentity?: string[];
  };
  format: Format;
  currentCopiesInDeck: number;
  addingQuantity?: number;
  commanderIdentity?: string[];
}): { legal: boolean; reasons: string[] } {
  const {
    card,
    format,
    currentCopiesInDeck,
    addingQuantity = 1,
    commanderIdentity,
  } = args;
  // Build structured issues, then render them through the same formatter the
  // full-deck legality check uses — so add-time and deck-level messages for the
  // same violation always read identically.
  const issues: LegalityIssue[] = [];

  const status = card.legalities[format.toLowerCase() as Lowercase<Format>];
  if (status && status !== "legal") {
    const kind = legalityKindForStatus(status);
    if (kind) issues.push({ kind, cardName: card.name });
  }

  if (isSingletonFormat(format) && !isBasicLandCard(card.typeLine, card.name)) {
    const totalAfter = currentCopiesInDeck + addingQuantity;
    if (totalAfter > 1) {
      issues.push({
        kind: "singleton_violation",
        cardName: card.name,
        quantity: totalAfter,
      });
    }
  }

  if (isColorIdentityFormat(format) && commanderIdentity) {
    const off = offIdentityColors(card.colorIdentity, commanderIdentity);
    if (off.length > 0) {
      issues.push({
        kind: "color_identity_violation",
        cardName: card.name,
        offending: off,
      });
    }
  }

  const reasons = issues.map(formatLegalityIssue);
  return { legal: reasons.length === 0, reasons };
}

export function getCardLegalityForDeck(args: Parameters<typeof checkSingleCard>[0]): {
  legal: boolean;
  reasons: string[];
} {
  return checkSingleCard(args);
}
