import type { DeckCard } from "@/lib/deck/zone-view";

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
  const needle = query.trim().toLowerCase();
  if (!needle) return { ids: new Set(), ranked: [] };

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
