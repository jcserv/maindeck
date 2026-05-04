import type { DeckCard } from "@/lib/deck/zone-view";
import { parseSyntax } from "@/lib/search/syntax-parser";
import { evaluateParsedWhere } from "@/lib/search/evaluate-where";

export interface DeckMatchResult {
  ids: Set<string>;
  ranked: DeckCard[];
}

type MatchKind = "exact" | "prefix" | "name" | "type" | "oracle";

const KIND_RANK: Record<MatchKind, number> = {
  exact: 0,
  prefix: 1,
  name: 2,
  type: 3,
  oracle: 4,
};

/**
 * Returns true when the query should be parsed as Scryfall syntax rather than
 * treated as a plain name fragment. Triggers on any of the known operator
 * characters or known field prefixes.
 */
function isSyntaxQuery(query: string): boolean {
  // Operator characters that only appear in Scryfall syntax
  if (/[:<=>/]/.test(query)) return true;
  // Known field prefixes (word boundary to avoid matching card names like "comic")
  if (/\b(?:cmc|t|c|o)\b/i.test(query)) return true;
  return false;
}

function classify(dc: DeckCard, needle: string): MatchKind | null {
  const name = dc.card.name.toLowerCase();
  if (name === needle) return "exact";
  if (name.startsWith(needle)) return "prefix";
  if (name.includes(needle)) return "name";
  const type = dc.card.typeLine?.toLowerCase();
  if (type && type.includes(needle)) return "type";
  const oracle = dc.card.oracleText?.toLowerCase();
  if (oracle && oracle.includes(needle)) return "oracle";
  return null;
}

export function matchDeckCards(
  cards: DeckCard[],
  query: string,
): DeckMatchResult {
  const trimmed = query.trim();
  if (!trimmed) return { ids: new Set(), ranked: [] };

  // Syntax path: binary match, no ranking beyond stable card-name order
  if (isSyntaxQuery(trimmed)) {
    const parsed = parseSyntax(trimmed);
    const matched = cards.filter((dc) => evaluateParsedWhere(dc, parsed));
    return {
      ids: new Set(matched.map((dc) => dc.id)),
      ranked: matched,
    };
  }

  // Substring path: ranked by match quality
  const needle = trimmed.toLowerCase();
  const scored: Array<{ dc: DeckCard; kind: MatchKind }> = [];
  for (const dc of cards) {
    const kind = classify(dc, needle);
    if (kind) scored.push({ dc, kind });
  }

  scored.sort((a, b) => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    return a.dc.card.name.localeCompare(b.dc.card.name);
  });

  return {
    ids: new Set(scored.map((s) => s.dc.id)),
    ranked: scored.map((s) => s.dc),
  };
}
