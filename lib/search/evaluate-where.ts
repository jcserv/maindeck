import type { DeckCard } from "@/lib/deck/zone-view";
import type { ParsedWhere } from "./syntax-parser";

const CMC_OPS: Record<string, (a: number, b: number) => boolean> = {
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "=": (a, b) => a === b,
};

function containsAll(haystack: string, fragments: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return fragments.every((f) => lower.includes(f.toLowerCase()));
}

/**
 * In-memory evaluator for a ParsedWhere predicate against a DeckCard.
 *
 * Mirrors the Postgres semantics in card-search.ts:
 *   - nameFragments: case-insensitive substring match on card name (ILIKE %frag%)
 *   - colors: card.colors must contain ALL specified colors
 *   - typeFragments: card.typeLine must contain ALL fragments (case-insensitive)
 *   - cmcFilters: card.cmc compared with the given operator and value (ANDed)
 *   - oracleFragments: card.oracleText must contain ALL fragments (case-insensitive)
 *
 * All non-empty filter groups are ANDed together.
 */
export function evaluateParsedWhere(dc: DeckCard, parsed: ParsedWhere): boolean {
  const { card } = dc;

  if (!containsAll(card.name, parsed.nameFragments)) return false;
  if (!containsAll(card.typeLine ?? "", parsed.typeFragments)) return false;
  if (!containsAll(card.oracleText ?? "", parsed.oracleFragments)) return false;

  for (const color of parsed.colors) {
    if (!card.colors.includes(color.toUpperCase())) return false;
  }

  const cmc = card.cmc ?? 0;
  for (const { op, value } of parsed.cmcFilters) {
    if (!CMC_OPS[op]?.(cmc, value)) return false;
  }

  return true;
}
