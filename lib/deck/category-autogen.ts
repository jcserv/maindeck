export type AutogenPreset = "byType" | "commanderTemplate";

/**
 * Minimal card shape required by the classifier. Matches the subset of
 * `Card` columns that can be queried from Prisma without loading the full row.
 */
export interface ClassifiableCard {
  mainType: string;
  oracleText: string | null;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// By-type preset
// ---------------------------------------------------------------------------

// These match the CardType enum values from the Prisma schema exactly.
// Kept as string literals so this pure module has no dependency on generated
// Prisma output, making it trivially unit-testable without Prisma setup.
const TYPE_CATEGORY: Record<string, string> = {
  Creature: "Creatures",
  Instant: "Instants",
  Sorcery: "Sorceries",
  Artifact: "Artifacts",
  Enchantment: "Enchantments",
  Planeswalker: "Planeswalkers",
  Battle: "Battles",
  Land: "Lands",
};

function classifyByType(card: ClassifiableCard): string | null {
  return TYPE_CATEGORY[card.mainType] ?? null;
}

// ---------------------------------------------------------------------------
// Commander-template preset
// ---------------------------------------------------------------------------

// Regex patterns are compiled once at module load.
const RE_RAMP_MANA = /add \{[wubrgc0-9/]+\}/i;
const RE_RAMP_FETCH = /search your library for (a |up to \w+ )?basic land/i;
const RE_BOARDWIPE =
  /destroy all|exile all|each (creature|player) sacrifices/i;
const RE_REMOVAL =
  /(destroy|exile) target (creature|permanent|nonland|artifact|enchantment|planeswalker)/i;
const RE_CARD_ADVANTAGE =
  /draw (a|two|three|four|five|that many|x) cards?/i;

function classifyCommanderTemplate(card: ClassifiableCard): string {
  const oracle = card.oracleText ?? "";

  if (card.mainType === "Land") return "Lands";

  if (
    RE_RAMP_MANA.test(oracle) ||
    RE_RAMP_FETCH.test(oracle) ||
    card.keywords.includes("Treasure")
  ) {
    return "Ramp";
  }

  if (RE_BOARDWIPE.test(oracle)) return "Boardwipes";

  if (RE_REMOVAL.test(oracle)) return "Removal";

  if (RE_CARD_ADVANTAGE.test(oracle)) return "Card advantage";

  return "Gameplan";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the category name for `card` under `preset`, or `null` when the
 * preset does not have a bucket for this card type (by-type only: exotic types
 * like Conspiracy, Dungeon, Vanguard, etc. are skipped).
 *
 * Pure function — no I/O, fully unit-testable.
 */
export function classifyCard(
  card: ClassifiableCard,
  preset: AutogenPreset,
): string | null {
  if (preset === "byType") return classifyByType(card);
  return classifyCommanderTemplate(card);
}
