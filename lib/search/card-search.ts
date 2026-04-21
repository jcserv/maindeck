import { createHash } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { type CardType } from "@/lib/generated/prisma/client";
import { type ParsedWhere } from "@/app/_components/search/syntax-parser";
import { getOrSet } from "@/lib/cache";
import { getRedis } from "@/lib/redis";

const SEARCH_TTL_SECONDS = 300; // 5m — short enough that ingest staleness self-heals
// Versioned keys let ingest invalidate every cached search result with a
// single INCR instead of a Redis SCAN sweep; stale entries age out under the
// TTL above once a new version is live.
const SEARCH_VERSION_KEY = "search:version";

async function getSearchVersion(): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 1;
  try {
    const raw = await redis.get(SEARCH_VERSION_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch {
    return 1;
  }
}

export async function bumpSearchVersion(): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.incr(SEARCH_VERSION_KEY);
  } catch {
    // swallow — old keys will still age out via TTL
  }
}

function searchKey(version: number, parts: Record<string, unknown>): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 12);
  return `search:v${version}:${hash}`;
}

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
  const trimmed = query.trim();
  if (!trimmed) return [];

  const version = await getSearchVersion();
  return getOrSet(
    searchKey(version, { kind: "plain", q: trimmed, limit }),
    SEARCH_TTL_SECONDS,
    () => runSearchCards(trimmed, limit),
  );
}

async function runSearchCards(
  trimmed: string,
  limit: number,
): Promise<CardSearchResult[]> {
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
  // Merge chip-level color/type with parsed tokens
  const allColors = Array.from(new Set([...parsed.colors, ...colors]));
  const allTypes = Array.from(new Set([...parsed.typeFragments, ...chipTypes]));

  const version = await getSearchVersion();
  return getOrSet(
    searchKey(version, {
      kind: "syntax",
      nameFragments: parsed.nameFragments,
      oracleFragments: parsed.oracleFragments,
      cmcFilters: parsed.cmcFilters,
      colors: allColors,
      types: allTypes,
      limit,
    }),
    SEARCH_TTL_SECONDS,
    () => runSearchCardsBySyntax(parsed, allColors, allTypes, limit),
  );
}

async function runSearchCardsBySyntax(
  parsed: ParsedWhere,
  allColors: string[],
  allTypes: string[],
  limit: number,
): Promise<CardSearchResult[]> {

  const where: Prisma.CardWhereInput = { AND: [] };
  const and = where.AND as Prisma.CardWhereInput[];

  // Name fragments — each fragment must match the name
  for (const frag of parsed.nameFragments) {
    and.push({ name: { contains: frag, mode: "insensitive" } });
  }

  // Color filter — every listed color must be in the colors array
  for (const color of allColors) {
    and.push({ colors: { has: color } });
  }

  // Type line filters
  for (const typeFrag of allTypes) {
    and.push({ typeLine: { contains: typeFrag, mode: "insensitive" } });
  }

  // CMC filters
  for (const { op, value } of parsed.cmcFilters) {
    const prismaOp: Prisma.FloatNullableFilter<"Card"> =
      op === "<=" ? { lte: value }
      : op === ">=" ? { gte: value }
      : op === "<" ? { lt: value }
      : op === ">" ? { gt: value }
      : { equals: value };
    and.push({ cmc: prismaOp });
  }

  // Oracle text fragments
  for (const frag of parsed.oracleFragments) {
    and.push({ oracleText: { contains: frag, mode: "insensitive" } });
  }

  const cards = await prisma.card.findMany({
    where,
    orderBy: { name: "asc" },
    take: limit,
    select: {
      id: true,
      name: true,
      mainType: true,
      typeLine: true,
      manaCost: true,
      legalities: true,
      gameChanger: true,
      colorIdentity: true,
    },
  });

  if (cards.length === 0) return [];

  // Fetch the canonical printing image for each card in a single round-trip.
  // Prisma's nested `include: { printings: { take: 1 } }` fans out to one
  // subquery per card; DISTINCT ON collapses that into a single statement.
  const cardIds = cards.map((c) => c.id);
  const printingRows = await prisma.$queryRaw<
    { card_id: number; image_uri: string }[]
  >(Prisma.sql`
    SELECT DISTINCT ON (card_id) card_id, image_uri
    FROM printing
    WHERE card_id = ANY(${cardIds}::int[])
    ORDER BY card_id, id ASC
  `);

  const imageByCardId = new Map(
    printingRows.map((row) => [row.card_id, row.image_uri] as const),
  );

  return cards.flatMap((c) => {
    const imageUri = imageByCardId.get(c.id);
    if (!imageUri) return [];
    return [
      {
        id: c.id,
        name: c.name,
        mainType: c.mainType,
        typeLine: c.typeLine,
        manaCost: c.manaCost,
        imageUri,
        legalities: (c.legalities ?? {}) as Record<string, string>,
        gameChanger: c.gameChanger,
        colorIdentity: c.colorIdentity ?? [],
      },
    ];
  });
}
