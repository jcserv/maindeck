import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { type CardType } from "@/lib/generated/prisma/client";
import type { Legalities } from "@/lib/card/types-meta";
import { type ParsedWhere } from "./syntax-parser";

export type CardSearchResult = {
  id: number;
  name: string;
  mainType: CardType;
  typeLine: string | null;
  manaCost: string | null;
  imageUri: string;
  legalities: Legalities;
  gameChanger: boolean;
  colorIdentity: string[];
};

type RawCardRow = {
  id: number;
  name: string;
  main_type: CardType;
  type_line: string | null;
  mana_cost: string | null;
  image_uri: string;
  legalities: unknown;
  game_changer: boolean;
  color_identity: string[] | null;
};

/** Escape Postgres LIKE/ILIKE special chars so user input is treated as literal text. */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => "\\" + m);
}

/**
 * Cards eligible to lead a Commander deck: legendary creatures, plus any card
 * (Backgrounds, certain planeswalkers) whose oracle text says it can be a
 * commander. Mirrors the singleton-format commander-zone rules so a typeahead
 * pick always maps to decks that can legally run it.
 */
const COMMANDER_ELIGIBLE = Prisma.sql`(
  (c.type_line ILIKE '%Legendary%' AND c.main_type::text = 'Creature')
  OR c.oracle_text ILIKE '%can be your commander%'
)`;

interface SearchCardsOptions {
  /** Restrict results to commander-eligible cards (see {@link COMMANDER_ELIGIBLE}). */
  commanderOnly?: boolean;
}

export async function searchCards(
  query: string,
  limit = 10,
  offset = 0,
  options: SearchCardsOptions = {},
): Promise<CardSearchResult[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("card-search");

  const trimmed = query.trim();
  if (!trimmed) return [];

  // Name search uses the card_name_trgm_idx GIN index (pg_trgm, enabled in
  // 20260421010000_perf_indices) so ILIKE '%frag%' hits an index rather than
  // seq-scanning. Ranking: exact match → prefix match → pg_trgm similarity.
  const escaped = escapeLike(trimmed);
  const pattern = `%${escaped}%`;
  const prefixPattern = `${escaped}%`;

  const eligibility = options.commanderOnly
    ? Prisma.sql`AND ${COMMANDER_ELIGIBLE}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<RawCardRow[]>(Prisma.sql`
    SELECT
      c.id,
      c.name,
      c.main_type,
      c.type_line,
      c.mana_cost,
      c.legalities,
      c.game_changer,
      c.color_identity,
      p.image_uri
    FROM card c
    INNER JOIN LATERAL (
      SELECT image_uri
      FROM printing
      WHERE card_id = c.id
      ORDER BY id ASC
      LIMIT 1
    ) p ON true
    WHERE c.name ILIKE ${pattern} ESCAPE '\'
    ${eligibility}
    ORDER BY
      CASE
        WHEN c.name ILIKE ${escaped} ESCAPE '\' THEN 1
        WHEN c.name ILIKE ${prefixPattern} ESCAPE '\' THEN 2
        ELSE 3
      END,
      similarity(c.name, ${trimmed}) DESC,
      c.name,
      c.id
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mainType: row.main_type,
    typeLine: row.type_line,
    manaCost: row.mana_cost,
    imageUri: row.image_uri,
    legalities: (row.legalities ?? {}) as Legalities,
    gameChanger: row.game_changer ?? false,
    colorIdentity: row.color_identity ?? [],
  }));
}

/** Maximum number of tokens accepted per fragment list to bound WHERE clause size. */
const MAX_FRAGMENTS = 8;

/**
 * Search cards using a parsed Scryfall-syntax query.
 * Applies color, type, CMC, oracle-text and name filters via Prisma WHERE.
 * Color filter chips (colors) and type filter chips (chipTypes) are ANDed
 * on top of any parsed c:/ t: operators.
 */
export async function searchCardsBySyntax(
  parsed: ParsedWhere,
  colors: string[] = [],
  chipTypes: string[] = [],
  limit = 60,
  offset = 0,
): Promise<CardSearchResult[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("card-search");

  // Merge chip-level color/type with parsed tokens
  const allColors = Array.from(new Set([...parsed.colors, ...colors]));
  const allTypes = Array.from(new Set([...parsed.typeFragments, ...chipTypes]));

  // Cap each fragment list to prevent runaway WHERE clauses from adversarial input.
  const nameFragments = parsed.nameFragments.slice(0, MAX_FRAGMENTS);
  const oracleFragments = parsed.oracleFragments.slice(0, MAX_FRAGMENTS);
  const typeFragments = allTypes.slice(0, MAX_FRAGMENTS);
  const cmcFilters = parsed.cmcFilters.slice(0, MAX_FRAGMENTS);

  const conditions: Prisma.Sql[] = [];

  // Name fragments: card_name_trgm_idx (GIN pg_trgm) makes ILIKE '%frag%' index-backed.
  for (const frag of nameFragments) {
    conditions.push(Prisma.sql`c.name ILIKE ${"%" + escapeLike(frag) + "%"}`);
  }

  for (const color of allColors) {
    conditions.push(Prisma.sql`c.color_identity @> ARRAY[${color}]::text[]`);
  }

  // Type fragments: use the card_search_tsv GIN index (tsvector over name +
  // oracle_text + type_line). websearch_to_tsquery handles stemming so
  // "creature" matches "Creature" in the type_line.
  for (const typeFrag of typeFragments) {
    conditions.push(
      Prisma.sql`c.search_tsv @@ websearch_to_tsquery('english', ${typeFrag})`,
    );
  }

  for (const { op, value } of cmcFilters) {
    if (op === "<=") conditions.push(Prisma.sql`c.cmc <= ${value}`);
    else if (op === ">=") conditions.push(Prisma.sql`c.cmc >= ${value}`);
    else if (op === "<") conditions.push(Prisma.sql`c.cmc < ${value}`);
    else if (op === ">") conditions.push(Prisma.sql`c.cmc > ${value}`);
    else conditions.push(Prisma.sql`c.cmc = ${value}`);
  }

  // Oracle fragments: card_search_tsv GIN index. websearch_to_tsquery supports
  // multi-word phrases ("draw a card") and boolean ops naturally.
  for (const frag of oracleFragments) {
    conditions.push(
      Prisma.sql`c.search_tsv @@ websearch_to_tsquery('english', ${frag})`,
    );
  }

  if (conditions.length === 0) return [];

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const rows = await prisma.$queryRaw<RawCardRow[]>(Prisma.sql`
    SELECT
      c.id,
      c.name,
      c.main_type,
      c.type_line,
      c.mana_cost,
      c.legalities,
      c.game_changer,
      c.color_identity,
      p.image_uri
    FROM card c
    INNER JOIN LATERAL (
      SELECT image_uri
      FROM printing
      WHERE card_id = c.id
      ORDER BY id ASC
      LIMIT 1
    ) p ON true
    ${whereClause}
    ORDER BY c.name
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mainType: row.main_type,
    typeLine: row.type_line,
    manaCost: row.mana_cost,
    imageUri: row.image_uri,
    legalities: (row.legalities ?? {}) as Legalities,
    gameChanger: row.game_changer ?? false,
    colorIdentity: row.color_identity ?? [],
  }));
}

/** Upper bound on names resolved per call — bounds the IN-list and result size. */
const MAX_NAMES = 500;

/**
 * Resolve a list of exact oracle **Card** names to their `CardSearchResult` rows.
 *
 * Used by integrations that arrive with names rather than ids (e.g. EDHREC
 * suggestions). Matching is case- and punctuation-exact on the canonical
 * Scryfall oracle `Card.name`, hitting its unique btree index; callers must pass
 * oracle-exact names, since lowercased or normalized names match zero rows. The
 * dedup/reorder maps key on the exact name. Names with no local row (un-ingested
 * cards) are dropped. Results preserve the input order so the caller's ranking
 * (synergy, inclusion) survives the round-trip.
 */
export async function findCardsByNames(
  names: string[],
): Promise<CardSearchResult[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("card-search");

  const wanted = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .slice(0, MAX_NAMES);
  if (wanted.length === 0) return [];

  const rows = await prisma.$queryRaw<RawCardRow[]>(Prisma.sql`
    SELECT
      c.id,
      c.name,
      c.main_type,
      c.type_line,
      c.mana_cost,
      c.legalities,
      c.game_changer,
      c.color_identity,
      p.image_uri
    FROM card c
    INNER JOIN LATERAL (
      SELECT image_uri
      FROM printing
      WHERE card_id = c.id
      ORDER BY id ASC
      LIMIT 1
    ) p ON true
    WHERE c.name = ANY(${wanted}::text[])
  `);

  const byName = new Map<string, CardSearchResult>();
  for (const row of rows) {
    byName.set(row.name, {
      id: row.id,
      name: row.name,
      mainType: row.main_type,
      typeLine: row.type_line,
      manaCost: row.mana_cost,
      imageUri: row.image_uri,
      legalities: (row.legalities ?? {}) as Legalities,
      gameChanger: row.game_changer ?? false,
      colorIdentity: row.color_identity ?? [],
    });
  }

  // Re-order to the input ranking, dropping names with no local row.
  const seen = new Set<number>();
  const ordered: CardSearchResult[] = [];
  for (const name of wanted) {
    const card = byName.get(name);
    if (card && !seen.has(card.id)) {
      seen.add(card.id);
      ordered.push(card);
    }
  }
  return ordered;
}
