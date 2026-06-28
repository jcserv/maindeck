import {
  type CardType,
  type Format,
  type Zone,
} from "@/lib/generated/prisma/enums";

type ComputeCard = {
  mainType: CardType;
  typeLine: string | null | undefined;
  oracleText: string | null | undefined;
  manaCost: string | null | undefined;
  cmc: number | null | undefined;
  colors: string[];
};

export type DeckCardWithRelations = {
  quantity: number;
  zone: Zone;
  card: ComputeCard;
  printing: { priceUsd: number | null; priceUsdFoil: number | null; priceEur: number | null; priceEurFoil: number | null } | null;
};

const EXCLUDED_ZONES = new Set<Zone>(["SIDEBOARD", "CONSIDERING"]);

function isLand(card: ComputeCard): boolean {
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

/**
 * Narrow a card list to only the given card types (matched on `mainType`).
 * An empty type list means "no filter" and returns the list unchanged, so
 * callers can pass the active selection straight through. Used by the deck
 * health section to recompute the curve and stats for a card-type subset
 * (e.g. "view curve with creatures only").
 */
export function filterByTypes<T extends DeckCardWithRelations>(
  cards: T[],
  types: CardType[],
): T[] {
  if (types.length === 0) return cards;
  const allowed = new Set<CardType>(types);
  return cards.filter((dc) => allowed.has(dc.card.mainType));
}

// ---------------------------------------------------------------------------
// Raw helpers — operate on a pre-scoped card slice (no zone filtering).
// Use these when the caller has already narrowed the list to the relevant cards
// (e.g. a single group section). The public API below wraps them with the
// mainboardCards() filter for whole-deck callers.
// ---------------------------------------------------------------------------

export function computeManaCurveRaw(
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

  for (const dc of cards) {
    if (isLand(dc.card)) continue;

    const mv = dc.card.cmc ?? 0;
    const bucket = mv >= 7 ? "7+" : String(Math.floor(mv));
    /* c8 ignore next */
    buckets[bucket] = (buckets[bucket] ?? 0) + dc.quantity;
  }

  return buckets;
}

export function computeColorPipsRaw(
  cards: DeckCardWithRelations[],
): { W: number; U: number; B: number; R: number; G: number; C: number } {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

  const monoRegex = /\{([WUBRGC])\}/g;
  const hybridRegex = /\{([WUBRG])\/([WUBRG])\}/g;
  // Phyrexian mana {C/P} is castable with that color's mana or 2 life.
  // We count it at full weight (1.0) because the color commitment is real —
  // building around Phyrexian cards still demands that color in the manabase.
  const phyrexianRegex = /\{([WUBRG])\/P\}/g;
  // Twobrid mana {2/C} can be paid with 2 generic or 1 of that color.
  // Weight 0.5 signals a soft color dependency — like hybrid, the card is
  // playable without the color but benefits from it.
  const twobrideRegex = /\{2\/([WUBRG])\}/g;

  for (const dc of cards) {
    const manaCost = dc.card.manaCost;
    if (!manaCost) continue;

    // Strip Phyrexian and twobrid symbols before monoRegex runs so that
    // bare {2} generic mana (from the stripped twobrid slot) contributes nothing.
    const afterPhyrexian = manaCost.replace(phyrexianRegex, (_, c: string) => {
      pips[c as keyof typeof pips] += 1.0 * dc.quantity;
      return "";
    });

    const afterTwobrid = afterPhyrexian.replace(twobrideRegex, (_, c: string) => {
      pips[c as keyof typeof pips] += 0.5 * dc.quantity;
      return "";
    });

    const stripped = afterTwobrid.replace(hybridRegex, (_, a: string, b: string) => {
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

export function computeAverageMVRaw(cards: DeckCardWithRelations[]): number {
  let totalMV = 0;
  let totalCount = 0;

  for (const dc of cards) {
    if (isLand(dc.card)) continue;
    totalMV += (dc.card.cmc ?? 0) * dc.quantity;
    totalCount += dc.quantity;
  }

  if (totalCount === 0) return 0;
  return totalMV / totalCount;
}

// ---------------------------------------------------------------------------
// Public API — apply mainboard zone filter then delegate to raw helpers.
// ---------------------------------------------------------------------------

export function computeManaCurve(
  cards: DeckCardWithRelations[],
): Record<string, number> {
  return computeManaCurveRaw(mainboardCards(cards));
}

export function computeColorPips(
  cards: DeckCardWithRelations[],
): { W: number; U: number; B: number; R: number; G: number; C: number } {
  return computeColorPipsRaw(mainboardCards(cards));
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
  return computeAverageMVRaw(mainboardCards(cards));
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

interface FormatTargets {
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
