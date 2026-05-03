import type { DeckCard } from "@/lib/deck/zone-view";
import type { ParsedWhere } from "./syntax-parser";

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

  // Name fragments — each must appear as a substring of the card name
  for (const frag of parsed.nameFragments) {
    if (!card.name.toLowerCase().includes(frag.toLowerCase())) return false;
  }

  // Color identity — card.colors must contain every specified color
  for (const color of parsed.colors) {
    if (!card.colors.includes(color.toUpperCase())) return false;
  }

  // Type fragments — card.typeLine must contain each fragment
  if (parsed.typeFragments.length > 0) {
    const typeLine = card.typeLine?.toLowerCase() ?? "";
    for (const frag of parsed.typeFragments) {
      if (!typeLine.includes(frag.toLowerCase())) return false;
    }
  }

  // CMC filters — each condition must hold
  for (const { op, value } of parsed.cmcFilters) {
    const cmc = card.cmc ?? 0;
    if (op === "<=" && !(cmc <= value)) return false;
    if (op === ">=" && !(cmc >= value)) return false;
    if (op === "<" && !(cmc < value)) return false;
    if (op === ">" && !(cmc > value)) return false;
    if (op === "=" && !(cmc === value)) return false;
  }

  // Oracle fragments — card.oracleText must contain each fragment
  if (parsed.oracleFragments.length > 0) {
    const oracle = card.oracleText?.toLowerCase() ?? "";
    for (const frag of parsed.oracleFragments) {
      if (!oracle.includes(frag.toLowerCase())) return false;
    }
  }

  return true;
}
