import {
  type CardType,
  type Format,
  type Zone,
} from "@/lib/generated/prisma/enums";
import { type Card, type DeckCard } from "@/lib/generated/prisma/browser";
import type { SerializedPrinting } from "@/lib/deck/queries";

export type DeckCardWithRelations = DeckCard & {
  card: Card;
  printing: SerializedPrinting | null;
};

const EXCLUDED_ZONES = new Set<Zone>(["SIDEBOARD", "CONSIDERING"]);

function isLand(card: Card): boolean {
  return (
    card.mainType === ("Land" as CardType) ||
    (card.typeLine?.includes("Land") ?? false)
  );
}

/**
 * Cards that contribute to mana curve / color pips / type breakdown.
 * Includes MAINBOARD and COMMANDER — the commander is part of the deck's
 * identity. Excludes SIDEBOARD and CONSIDERING.
 */
function mainboardCards(cards: DeckCardWithRelations[]): DeckCardWithRelations[] {
  return cards.filter((dc) => !EXCLUDED_ZONES.has(dc.zone));
}

export function computeManaCurve(
  cards: DeckCardWithRelations[],
): Record<string, number> {
  const buckets: Record<string, number> = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6": 0,
    "7+": 0,
  };

  for (const dc of mainboardCards(cards)) {
    if (isLand(dc.card)) continue;

    const mv = dc.card.cmc ?? 0;
    const bucket = mv >= 7 ? "7+" : String(Math.floor(mv));
    buckets[bucket] = (buckets[bucket] ?? 0) + dc.quantity;
  }

  return buckets;
}

export function computeColorPips(
  cards: DeckCardWithRelations[],
): { W: number; U: number; B: number; R: number; G: number; C: number } {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

  const monoRegex = /\{([WUBRGC])\}/g;
  const hybridRegex = /\{([WUBRG])\/([WUBRG])\}/g;

  for (const dc of mainboardCards(cards)) {
    const manaCost = dc.card.manaCost;
    if (!manaCost) continue;

    const stripped = manaCost.replace(hybridRegex, (_, a: string, b: string) => {
      pips[a as keyof typeof pips] += 0.5 * dc.quantity;
      pips[b as keyof typeof pips] += 0.5 * dc.quantity;
      return "";
    });

    let match;
    monoRegex.lastIndex = 0;
    while ((match = monoRegex.exec(stripped)) !== null) {
      const color = match[1] as keyof typeof pips;
      pips[color] += dc.quantity;
    }
  }

  return pips;
}

export function computeTypeBreakdown(
  cards: DeckCardWithRelations[],
): Record<string, number> {
  const breakdown: Record<string, number> = {};

  for (const dc of mainboardCards(cards)) {
    const type = dc.card.mainType as string;
    breakdown[type] = (breakdown[type] ?? 0) + dc.quantity;
  }

  return breakdown;
}

export function computeAverageMV(cards: DeckCardWithRelations[]): number {
  let totalMV = 0;
  let totalCount = 0;

  for (const dc of mainboardCards(cards)) {
    if (isLand(dc.card)) continue;
    totalMV += (dc.card.cmc ?? 0) * dc.quantity;
    totalCount += dc.quantity;
  }

  if (totalCount === 0) return 0;
  return totalMV / totalCount;
}

export function expectedLandsInHand(
  cards: DeckCardWithRelations[],
  handSize = 7,
): number {
  const mainboard = mainboardCards(cards);
  const deckSize = mainboard.reduce((sum, dc) => sum + dc.quantity, 0);
  if (deckSize === 0) return 0;

  const landCount = mainboard
    .filter((dc) => isLand(dc.card))
    .reduce((sum, dc) => sum + dc.quantity, 0);

  return (landCount / deckSize) * handSize;
}

export function countLands(cards: DeckCardWithRelations[]): number {
  return mainboardCards(cards)
    .filter((dc) => isLand(dc.card))
    .reduce((sum, dc) => sum + dc.quantity, 0);
}

export interface FormatTargets {
  requiredCards: number | null;
  targetLands: number | null;
}

export function formatTargets(format: Format): FormatTargets {
  switch (format) {
    case "COMMANDER":
    case "OATHBREAKER":
      return { requiredCards: 100, targetLands: 36 };
    case "BRAWL":
      return { requiredCards: 60, targetLands: 24 };
    default:
      return { requiredCards: 60, targetLands: 24 };
  }
}
