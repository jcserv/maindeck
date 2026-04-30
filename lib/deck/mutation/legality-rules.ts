import { Format, Zone } from "@/lib/generated/prisma/enums";
import { isBasicLand } from "@/lib/deck/zone-view";
import type { DeckSnapshot, LegalityIssue, SnapshotCard } from "./types";

export const SINGLETON_FORMATS = new Set<Format>([
  Format.COMMANDER,
  Format.BRAWL,
  Format.OATHBREAKER,
]);

export const COLOR_IDENTITY_FORMATS = new Set<Format>([
  Format.COMMANDER,
  Format.BRAWL,
  Format.OATHBREAKER,
]);

const SIXTY_CARD_FORMATS = new Set<Format>([
  Format.STANDARD,
  Format.PIONEER,
  Format.MODERN,
  Format.LEGACY,
  Format.VINTAGE,
  Format.PAUPER,
  Format.HISTORIC,
  Format.EXPLORER,
  Format.ALCHEMY,
]);

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

function offIdentityColors(
  cardIdentity: string[] | null | undefined,
  commanderIdentity: string[],
): string[] {
  if (!cardIdentity?.length) return [];
  const allowed = new Set(commanderIdentity);
  return cardIdentity.filter((c) => !allowed.has(c));
}

function formatColors(colors: string[]): string {
  return colors.map((c) => `{${c}}`).join("");
}

function legalityMessageForStatus(
  status: string,
  format: Format,
): string | null {
  const fmt = format.charAt(0) + format.slice(1).toLowerCase();
  switch (status) {
    case "banned":
      return `Banned in ${fmt}`;
    case "restricted":
      return `Restricted in ${fmt}`;
    case "not_legal":
      return `Not legal in ${fmt}`;
    default:
      return null;
  }
}

export function checkPerCardLegality(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const formatKey = snap.format.toLowerCase();
  for (const dc of snap.cards) {
    if (dc.zone === Zone.SIDEBOARD || dc.zone === Zone.CONSIDERING) continue;
    const status = dc.legalities[formatKey];
    if (status && status !== "legal") {
      const msg = legalityMessageForStatus(status, snap.format);
      if (msg) {
        issues.push({
          code: `card_${status}`,
          message: `${dc.cardName}: ${msg}`,
        });
      }
    }
  }
  return issues;
}

export function checkSingleton(snap: DeckSnapshot): LegalityIssue[] {
  if (!SINGLETON_FORMATS.has(snap.format)) return [];
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
      issues.push({
        code: "singleton_violation",
        message: `${name}: Singleton format — ${count} copies in deck`,
      });
    }
  }
  return issues;
}

export function checkColorIdentity(snap: DeckSnapshot): LegalityIssue[] {
  if (!COLOR_IDENTITY_FORMATS.has(snap.format)) return [];
  const commanderZone = snap.cards.filter((c) => c.zone === Zone.COMMANDER);
  if (commanderZone.length === 0) return [];

  const commanderIdentity = new Set<string>();
  for (const dc of commanderZone) {
    for (const c of dc.colorIdentity ?? []) commanderIdentity.add(c);
  }
  const allowed = [...commanderIdentity];
  const issues: LegalityIssue[] = [];
  for (const dc of snap.cards) {
    if (dc.zone !== Zone.MAINBOARD && dc.zone !== Zone.COMMANDER) continue;
    const off = offIdentityColors(dc.colorIdentity, allowed);
    if (off.length > 0) {
      issues.push({
        code: "color_identity_violation",
        message: `${dc.cardName}: Outside commander color identity (${formatColors(off)})`,
      });
    }
  }
  return issues;
}

export function checkDeckSize(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const mainboard = snap.cards.filter((c) => c.zone === Zone.MAINBOARD);
  const sideboard = snap.cards.filter((c) => c.zone === Zone.SIDEBOARD);
  const commanderZone = snap.cards.filter((c) => c.zone === Zone.COMMANDER);

  if (snap.format === Format.COMMANDER) {
    const total =
      mainboard.reduce((s, c) => s + c.quantity, 0) +
      commanderZone.reduce((s, c) => s + c.quantity, 0);
    if (total !== 100) {
      issues.push({
        code: "deck_size",
        message: `Commander decks must have exactly 100 cards (currently ${total})`,
      });
    }
    if (commanderZone.length === 0) {
      issues.push({
        code: "no_commander",
        message:
          "Commander decks must have exactly one card in the commander zone",
      });
    }
  } else if (SIXTY_CARD_FORMATS.has(snap.format)) {
    const mainTotal = mainboard.reduce((s, c) => s + c.quantity, 0);
    if (mainTotal < 60) {
      issues.push({
        code: "deck_size",
        message: `Mainboard must have at least 60 cards (currently ${mainTotal})`,
      });
    }
    const sideTotal = sideboard.reduce((s, c) => s + c.quantity, 0);
    if (sideTotal > 15) {
      issues.push({
        code: "sideboard_size",
        message: `Sideboard may have at most 15 cards (currently ${sideTotal})`,
      });
    }
  }
  return issues;
}

export function fullLegality(snap: DeckSnapshot): LegalityIssue[] {
  return [
    ...checkPerCardLegality(snap),
    ...checkSingleton(snap),
    ...checkColorIdentity(snap),
    ...checkDeckSize(snap),
  ];
}

export function checkSingleCard(args: {
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
  const {
    card,
    format,
    currentCopiesInDeck,
    addingQuantity = 1,
    commanderIdentity,
  } = args;
  const reasons: string[] = [];

  const status = card.legalities[format.toLowerCase()];
  if (status && status !== "legal") {
    const msg = legalityMessageForStatus(status, format);
    if (msg) reasons.push(msg);
  }

  if (SINGLETON_FORMATS.has(format)) {
    if (!isBasicLandCard(card.typeLine, card.name)) {
      const totalAfter = currentCopiesInDeck + addingQuantity;
      if (totalAfter > 1) {
        reasons.push(
          `Singleton format — already have ${currentCopiesInDeck} cop${currentCopiesInDeck === 1 ? "y" : "ies"} in deck`,
        );
      }
    }
  }

  if (COLOR_IDENTITY_FORMATS.has(format) && commanderIdentity) {
    const off = offIdentityColors(card.colorIdentity, commanderIdentity);
    if (off.length > 0) {
      reasons.push(`Outside commander color identity (${formatColors(off)})`);
    }
  }

  return { legal: reasons.length === 0, reasons };
}

export type { SnapshotCard };
