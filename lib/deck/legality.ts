import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Deck } from "./zone-view";
import { isBasicLand } from "./zone-view";

export type LegalityIssue = { code: string; message: string };
export type DeckLegality = { legal: boolean; issues: LegalityIssue[] };

const SINGLETON_FORMATS = new Set<Format>([
  Format.COMMANDER,
  Format.BRAWL,
  Format.OATHBREAKER,
]);

const COLOR_IDENTITY_FORMATS = new Set<Format>([
  Format.COMMANDER,
  Format.BRAWL,
  Format.OATHBREAKER,
]);

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

// Basic land names that are exempt from singleton rules
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

function isBasicLandCard(
  typeLine: string | null | undefined,
  name: string,
): boolean {
  return isBasicLand(typeLine) || BASIC_LAND_NAMES.has(name);
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

export function validateDeck(deck: Deck): DeckLegality {
  const issues: LegalityIssue[] = [];
  const format = deck.format as Format;

  const mainboard = deck.cards.filter((c) => c.zone === Zone.MAINBOARD);
  const sideboard = deck.cards.filter((c) => c.zone === Zone.SIDEBOARD);
  const commanderZone = deck.cards.filter((c) => c.zone === Zone.COMMANDER);

  // --- Per-card format legality ---
  for (const dc of deck.cards) {
    if (dc.zone === Zone.SIDEBOARD || dc.zone === Zone.CONSIDERING) continue;

    const legalities = dc.card.legalities as Record<string, string> | null;
    if (!legalities) continue;

    const status = legalities[format.toLowerCase()];
    if (status && status !== "legal") {
      const msg = legalityMessageForStatus(status, format);
      if (msg) {
        issues.push({
          code: `card_${status}`,
          message: `${dc.card.name}: ${msg}`,
        });
      }
    }
  }

  // --- Singleton rule ---
  if (SINGLETON_FORMATS.has(format)) {
    // Count copies across MAINBOARD + COMMANDER zones per card name
    const countByName = new Map<string, number>();
    const typeByName = new Map<string, string | null>();
    for (const dc of deck.cards) {
      if (dc.zone !== Zone.MAINBOARD && dc.zone !== Zone.COMMANDER) continue;
      const name = dc.card.name;
      typeByName.set(name, dc.card.typeLine ?? null);
      countByName.set(name, (countByName.get(name) ?? 0) + dc.quantity);
    }

    for (const [name, count] of countByName) {
      if (count > 1 && !isBasicLandCard(typeByName.get(name), name)) {
        issues.push({
          code: "singleton_violation",
          message: `${name}: Singleton format — ${count} copies in deck`,
        });
      }
    }
  }

  // --- Color identity (Commander / Brawl / Oathbreaker) ---
  if (COLOR_IDENTITY_FORMATS.has(format) && commanderZone.length > 0) {
    const commanderIdentity = new Set<string>();
    for (const dc of commanderZone) {
      for (const c of dc.card.colorIdentity ?? []) commanderIdentity.add(c);
    }
    const allowed = [...commanderIdentity];
    for (const dc of deck.cards) {
      if (dc.zone !== Zone.MAINBOARD && dc.zone !== Zone.COMMANDER) continue;
      const off = offIdentityColors(dc.card.colorIdentity, allowed);
      if (off.length > 0) {
        issues.push({
          code: "color_identity_violation",
          message: `${dc.card.name}: Outside commander color identity (${formatColors(off)})`,
        });
      }
    }
  }

  // --- Deck size rules ---
  if (format === Format.COMMANDER) {
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
        message: "Commander decks must have exactly one card in the commander zone",
      });
    }
  } else if (SIXTY_CARD_FORMATS.has(format)) {
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
  // BRAWL, OATHBREAKER, CASUAL: skip size rules

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
  const {
    card,
    format,
    currentCopiesInDeck,
    addingQuantity = 1,
    commanderIdentity,
  } = args;
  const reasons: string[] = [];

  // Format legality check
  const status = card.legalities[format.toLowerCase()];
  if (status && status !== "legal") {
    const msg = legalityMessageForStatus(status, format);
    if (msg) reasons.push(msg);
  }

  // Singleton check
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

  // Color identity check
  if (COLOR_IDENTITY_FORMATS.has(format) && commanderIdentity) {
    const off = offIdentityColors(card.colorIdentity, commanderIdentity);
    if (off.length > 0) {
      reasons.push(
        `Outside commander color identity (${formatColors(off)})`,
      );
    }
  }

  return { legal: reasons.length === 0, reasons };
}
