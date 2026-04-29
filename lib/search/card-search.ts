import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { type CardType } from "@/lib/generated/prisma/client";
import { type ParsedWhere } from "@/app/_components/search/syntax-parser";

export type CardSearchResult = {
  id: number;
  name: string;
  mainType: CardType;
  typeLine: string | null;
  manaCost: string | null;
  imageUri: string;
  legalities: Record<string, string>;
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

export async function searchCards(
  query: string,
  limit = 10,
): Promise<CardSearchResult[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("card-search");

  const trimmed = query.trim();
  if (!trimmed) return [];

  const pattern = `%${trimmed}%`;
  const prefixPattern = `${trimmed}%`;

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
    WHERE c.name ILIKE ${pattern}
    ORDER BY
      CASE
        WHEN c.name ILIKE ${trimmed} THEN 1
        WHEN c.name ILIKE ${prefixPattern} THEN 2
        ELSE 3
      END,
      c.name
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mainType: row.main_type,
    typeLine: row.type_line,
    manaCost: row.mana_cost,
    imageUri: row.image_uri,
    legalities: (row.legalities ?? {}) as Record<string, string>,
    gameChanger: row.game_changer ?? false,
    colorIdentity: row.color_identity ?? [],
  }));
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
): Promise<CardSearchResult[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("card-search");

  // Merge chip-level color/type with parsed tokens
  const allColors = Array.from(new Set([...parsed.colors, ...colors]));
  const allTypes = Array.from(new Set([...parsed.typeFragments, ...chipTypes]));

  const conditions: Prisma.Sql[] = [];

  for (const frag of parsed.nameFragments) {
    conditions.push(Prisma.sql`c.name ILIKE ${"%" + frag + "%"}`);
  }

  for (const color of allColors) {
    conditions.push(Prisma.sql`c.colors @> ARRAY[${color}]::text[]`);
  }

  for (const typeFrag of allTypes) {
    conditions.push(Prisma.sql`c.type_line ILIKE ${"%" + typeFrag + "%"}`);
  }

  for (const { op, value } of parsed.cmcFilters) {
    if (op === "<=") conditions.push(Prisma.sql`c.cmc <= ${value}`);
    else if (op === ">=") conditions.push(Prisma.sql`c.cmc >= ${value}`);
    else if (op === "<") conditions.push(Prisma.sql`c.cmc < ${value}`);
    else if (op === ">") conditions.push(Prisma.sql`c.cmc > ${value}`);
    else conditions.push(Prisma.sql`c.cmc = ${value}`);
  }

  for (const frag of parsed.oracleFragments) {
    conditions.push(Prisma.sql`c.oracle_text ILIKE ${"%" + frag + "%"}`);
  }

  const whereClause =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
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
    ${whereClause}
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
    legalities: (row.legalities ?? {}) as Record<string, string>,
    gameChanger: row.game_changer ?? false,
    colorIdentity: row.color_identity ?? [],
  }));
}
