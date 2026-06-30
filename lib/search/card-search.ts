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

function mapRow(row: RawCardRow): CardSearchResult {
  return {
    id: row.id,
    name: row.name,
    mainType: row.main_type,
    typeLine: row.type_line,
    manaCost: row.mana_cost,
    imageUri: row.image_uri,
    legalities: (row.legalities ?? {}) as Legalities,
    gameChanger: row.game_changer ?? false,
    colorIdentity: row.color_identity ?? [],
  };
}

const SELECT_CARD_FIELDS = Prisma.sql`
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
  ) p ON true`;

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
    ${SELECT_CARD_FIELDS}
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

  if (rows.length > 0) return rows.map(mapRow);

  // Fuzzy fallback: ILIKE found nothing (likely a misspelling). Use pg_trgm
  // <% operator (word_similarity) — card_name_trgm_idx GIN index makes this fast.
  const fuzzyRows = await prisma.$queryRaw<RawCardRow[]>(Prisma.sql`
    ${SELECT_CARD_FIELDS}
    WHERE ${trimmed} <% c.name
    ${eligibility}
    ORDER BY word_similarity(${trimmed}, c.name) DESC, c.name, c.id
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return fuzzyRows.map(mapRow);
}

/** Maximum number of tokens accepted per fragment list to bound WHERE clause size. */
const MAX_FRAGMENTS = 8;

function cmcConditions(
  filters: Array<{ op: "<=" | ">=" | "<" | ">" | "="; value: number }>,
): Prisma.Sql[] {
  return filters.map(({ op, value }) => {
    if (op === "<=") return Prisma.sql`c.cmc <= ${value}`;
    if (op === ">=") return Prisma.sql`c.cmc >= ${value}`;
    if (op === "<") return Prisma.sql`c.cmc < ${value}`;
    if (op === ">") return Prisma.sql`c.cmc > ${value}`;
    return Prisma.sql`c.cmc = ${value}`;
  });
}

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

  conditions.push(...cmcConditions(cmcFilters));

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
    ${SELECT_CARD_FIELDS}
    ${whereClause}
    ORDER BY c.name
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  if (rows.length > 0 || nameFragments.length === 0) return rows.map(mapRow);

  // Fuzzy fallback: name ILIKE conditions matched nothing (misspelling).
  // Replace name conditions with <% operator (word_similarity); keep color/type/CMC/oracle filters.
  const fuzzyConditions: Prisma.Sql[] = nameFragments.map(
    (frag) => Prisma.sql`${frag} <% c.name`,
  );

  for (const color of allColors) {
    fuzzyConditions.push(Prisma.sql`c.color_identity @> ARRAY[${color}]::text[]`);
  }
  for (const typeFrag of typeFragments) {
    fuzzyConditions.push(
      Prisma.sql`c.search_tsv @@ websearch_to_tsquery('english', ${typeFrag})`,
    );
  }
  fuzzyConditions.push(...cmcConditions(cmcFilters));
  for (const frag of oracleFragments) {
    fuzzyConditions.push(
      Prisma.sql`c.search_tsv @@ websearch_to_tsquery('english', ${frag})`,
    );
  }

  const fuzzyWhereClause = Prisma.sql`WHERE ${Prisma.join(fuzzyConditions, " AND ")}`;

  const fuzzyOrderBy =
    nameFragments.length === 1
      ? Prisma.sql`word_similarity(${nameFragments[0]}, c.name) DESC, c.name, c.id`
      : Prisma.sql`GREATEST(${Prisma.join(nameFragments.map((f) => Prisma.sql`word_similarity(${f}, c.name)`), ", ")}) DESC, c.name, c.id`;

  const fuzzyRows = await prisma.$queryRaw<RawCardRow[]>(Prisma.sql`
    ${SELECT_CARD_FIELDS}
    ${fuzzyWhereClause}
    ORDER BY ${fuzzyOrderBy}
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return fuzzyRows.map(mapRow);
}

/**
 * Return a representative sample of cards for the default (no-query) search state.
 * Results are cached for a day so the empty-state load is free.
 */
export async function getDefaultCards(limit = 25): Promise<CardSearchResult[]> {
  "use cache";
  cacheLife("days");
  cacheTag("card-search");

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
    ORDER BY c.name
    LIMIT ${limit}
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
 * suggestions). The primary match is case- and punctuation-exact on the
 * canonical Scryfall oracle `Card.name`, hitting its unique btree index; callers
 * must pass oracle-exact names, since lowercased or normalized names match zero
 * rows. Any names still unmatched fall back to a front-face lookup: a
 * double-faced card whose canonical name is `"Front // Back"` is matched when the
 * requested name equals its front face (the segment before `" // "`), since some
 * sources (e.g. EDHREC) emit only the front face for DFCs. Names with no local
 * row (un-ingested cards) are dropped. Results preserve the input order so the
 * caller's ranking (synergy, inclusion) survives the round-trip, and each card
 * appears at most once even when matched by both name and front face.
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
    ${SELECT_CARD_FIELDS}
    WHERE c.name = ANY(${wanted}::text[])
  `);

  const byName = new Map<string, CardSearchResult>();
  for (const row of rows) {
    byName.set(row.name, mapRow(row));
  }

  // Front-face fallback for any name a source emitted without its back face
  // (e.g. EDHREC sends "Front" for a card whose canonical name is "Front // Back").
  const unmatched = wanted.filter((n) => !byName.has(n));
  const byFrontFace = new Map<string, CardSearchResult>();
  if (unmatched.length > 0) {
    const patterns = unmatched.map(
      (n) => `${n.replace(/[\\%_]/g, (c) => `\\${c}`)} // %`,
    );
    const dfcRows = await prisma.$queryRaw<RawCardRow[]>(Prisma.sql`
      ${SELECT_CARD_FIELDS}
      WHERE c.name LIKE ANY(${patterns}::text[])
    `);
    for (const row of dfcRows) {
      const front = row.name.split(" // ")[0] ?? row.name;
      if (!byFrontFace.has(front)) byFrontFace.set(front, mapRow(row));
    }
  }

  // Re-order to the input ranking, dropping names with no local row.
  const seen = new Set<number>();
  const ordered: CardSearchResult[] = [];
  for (const name of wanted) {
    const card = byName.get(name) ?? byFrontFace.get(name);
    if (card && !seen.has(card.id)) {
      seen.add(card.id);
      ordered.push(card);
    }
  }
  return ordered;
}
