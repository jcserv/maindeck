import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma, type Format } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  classifyLandCycle,
  fetchableColors,
  LAND_CYCLES,
  type LandCycleId,
} from "./cycles";

export interface LandCandidate {
  id: number;
  name: string;
  typeLine: string | null;
  manaCost: string | null;
  imageUri: string;
  colorIdentity: string[];
  cycleId: LandCycleId;
}

type RawLandRow = {
  id: number;
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  mana_cost: string | null;
  image_uri: string;
  colors: string[] | null;
  color_identity: string[] | null;
};

const WUBRG = ["W", "U", "B", "R", "G"] as const;

const BASIC_LAND_NAMES = [
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
] as const;

function emptyBuckets(): Record<LandCycleId, LandCandidate[]> {
  return Object.fromEntries(
    LAND_CYCLES.map((cycle) => [cycle.id, [] as LandCandidate[]]),
  ) as Record<LandCycleId, LandCandidate[]>;
}

/**
 * All nonbasic land candidates legal under `deckIdentity` *and* `format`,
 * bucketed by cycle.
 *
 * SQL narrows by type, color identity (same containment trick as
 * `card-search.ts`: a card is excluded if its color identity touches any color
 * outside the deck's), and format legality — a land is kept only if its
 * Scryfall `legalities` entry for the format is `legal` or `restricted`
 * (`banned`/`not_legal`/missing are dropped). Cycle bucketing stays in pure
 * code via {@link classifyLandCycle}.
 */
export async function getLandCandidates(
  deckIdentity: string[],
  format: Format,
): Promise<Record<LandCycleId, LandCandidate[]>> {
  "use cache";
  cacheLife("weeks");
  cacheTag("manabase-candidates");

  const excluded = WUBRG.filter((c) => !deckIdentity.includes(c));
  const identityClause =
    excluded.length > 0
      ? Prisma.sql`AND NOT (c.color_identity && ARRAY[${Prisma.join(excluded)}]::text[])`
      : Prisma.empty;

  // Scryfall keys legalities by lowercased format name (see Legalities type).
  const formatKey = format.toLowerCase();

  const rows = await prisma.$queryRaw<RawLandRow[]>(Prisma.sql`
    SELECT
      c.id,
      c.name,
      c.type_line,
      c.oracle_text,
      c.mana_cost,
      c.colors,
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
    WHERE c.main_type = 'Land'
      AND c.type_line NOT ILIKE '%Basic%'
      AND c.legalities ->> ${formatKey} IN ('legal', 'restricted')
      ${identityClause}
    ORDER BY c.name
  `);

  const identitySet = new Set(deckIdentity);
  const buckets = emptyBuckets();
  for (const row of rows) {
    const cycleId = classifyLandCycle({
      name: row.name,
      typeLine: row.type_line,
      oracleText: row.oracle_text,
      colors: row.colors ?? [],
      colorIdentity: row.color_identity ?? [],
    });

    // Fetch lands have an empty color identity, so the SQL identity filter
    // can't scope them. Keep a fetch if it can grab at least one on-color basic
    // type — a Swamp-or-Mountain fetch is useful to a B/R deck even though one
    // mode is off-color. Generic "basic land" fetches name none — always kept.
    if (cycleId === "fetch") {
      const fc = fetchableColors(row.oracle_text);
      if (fc.length > 0 && !fc.some((c) => identitySet.has(c))) continue;
    }

    buckets[cycleId].push({
      id: row.id,
      name: row.name,
      typeLine: row.type_line,
      manaCost: row.mana_cost,
      imageUri: row.image_uri,
      colorIdentity: row.color_identity ?? [],
      cycleId,
    });
  }

  return buckets;
}

/**
 * Resolve the canonical (non-snow) basic land `Card.id` for each color. `C`
 * maps to Wastes. `Card.name` is `@unique`, so each name yields at most one id.
 */
export async function getBasicLandCardIds(): Promise<
  Record<"W" | "U" | "B" | "R" | "G" | "C", number>
> {
  "use cache";
  cacheLife("weeks");
  cacheTag("manabase-candidates");

  const cards = await prisma.card.findMany({
    where: { name: { in: [...BASIC_LAND_NAMES] } },
    select: { id: true, name: true },
  });

  const byName = new Map(cards.map((c) => [c.name, c.id]));
  return {
    W: byName.get("Plains")!,
    U: byName.get("Island")!,
    B: byName.get("Swamp")!,
    R: byName.get("Mountain")!,
    G: byName.get("Forest")!,
    C: byName.get("Wastes")!,
  };
}
