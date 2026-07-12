import { Zone } from "@/lib/generated/prisma/enums";
import { isBasicLand } from "@/lib/deck/zone-view";
import type { DeckSnapshot, LegalityIssue } from "@/lib/deck/mutation/types";

export type LegalityRule = (snap: DeckSnapshot) => LegalityIssue[];

const BASIC_LAND_NAMES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
]);

export function isBasicLandCard(
  typeLine: string | null | undefined,
  name: string,
): boolean {
  return isBasicLand(typeLine) || BASIC_LAND_NAMES.has(name);
}

/**
 * Maps a LegalityIssue variant to a human-readable string.
 * Centralised here so UI code never needs to reconstruct messages from fields.
 */
export function formatLegalityIssue(issue: LegalityIssue): string {
  switch (issue.kind) {
    case "deck_size":
      return `Deck must have exactly ${issue.expected} cards (currently ${issue.actual})`;
    case "no_commander":
      return "Commander decks must have exactly one card in the commander zone";
    case "sideboard_size":
      return `Sideboard may have at most ${issue.expected} cards (currently ${issue.actual})`;
    case "card_banned":
      return `${issue.cardName}: Banned`;
    case "card_restricted":
      return `${issue.cardName}: Restricted`;
    case "card_not_legal":
      return `${issue.cardName}: Not legal`;
    case "singleton_violation":
      return `${issue.cardName}: Singleton format — ${issue.quantity} copies in deck`;
    case "color_identity_violation":
      return `${issue.cardName}: Outside commander color identity (${issue.offending.map((c) => `{${c}}`).join("")})`;
    case "companion_violation":
      return `${issue.cardName}: Companion restriction not met — ${issue.reason}`;
    case "category_zone_mismatch":
      return "Subcategories only apply to MAINBOARD cards";
    case "unknown_category":
      return `Category "${issue.category}" not found in deck`;
  }
}

/** @internal Use formatLegalityIssue(issue) in UI instead. */
export function legalityKindForStatus(
  status: string,
): "card_banned" | "card_restricted" | "card_not_legal" | null {
  switch (status) {
    case "banned":
      return "card_banned";
    case "restricted":
      return "card_restricted";
    case "not_legal":
      return "card_not_legal";
    default:
      return null;
  }
}

export function offIdentityColors(
  cardIdentity: string[] | null | undefined,
  commanderIdentity: readonly string[],
): string[] {
  if (!cardIdentity?.length) return [];
  const allowed = new Set(commanderIdentity);
  return cardIdentity.filter((c) => !allowed.has(c));
}

export function formatColors(colors: readonly string[]): string {
  return colors.map((c) => `{${c}}`).join("");
}

/** Singleton rule body: at most one non-basic copy across MAINBOARD + COMMANDER. */
export function singletonRule(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const countByName = new Map<string, number>();
  const typeByName = new Map<string, string | null>();
  for (const dc of snap.cards) {
    if (dc.zone !== Zone.MAINBOARD && dc.zone !== Zone.COMMANDER) continue;
    typeByName.set(dc.cardName, dc.typeLine);
    countByName.set(
      dc.cardName,
      (countByName.get(dc.cardName) ?? 0) + dc.quantity,
    );
  }
  for (const [name, count] of countByName) {
    if (count > 1 && !isBasicLandCard(typeByName.get(name), name)) {
      issues.push({ kind: "singleton_violation", cardName: name, quantity: count });
    }
  }
  return issues;
}

/** Color identity rule: every non-sideboard card must fit the commander's identity. */
export function colorIdentityRule(snap: DeckSnapshot): LegalityIssue[] {
  const commanderZone = snap.cards.filter((c) => c.zone === Zone.COMMANDER);
  if (commanderZone.length === 0) return [];

  const commanderIdentity = new Set<string>();
  for (const dc of commanderZone) {
    for (const c of dc.colorIdentity ?? []) commanderIdentity.add(c);
  }
  const allowed = [...commanderIdentity];
  const issues: LegalityIssue[] = [];
  for (const dc of snap.cards) {
    if (
      dc.zone !== Zone.MAINBOARD &&
      dc.zone !== Zone.COMMANDER &&
      dc.zone !== Zone.COMPANION
    )
      continue;
    const off = offIdentityColors(dc.colorIdentity, allowed);
    if (off.length > 0) {
      issues.push({
        kind: "color_identity_violation",
        cardName: dc.cardName,
        offending: off,
      });
    }
  }
  return issues;
}
