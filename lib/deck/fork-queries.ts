import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { deckTag, forkLineageTag } from "@/lib/deck/cache-tags";

/**
 * One ancestor in a fork chain. PRIVATE ancestors are masked at the SQL layer:
 * the `masked` flag is true and identifying fields are null.
 */
export type ForkAncestor =
  | {
      masked: false;
      id: string;
      name: string;
      username: string;
      depth: number;
    }
  | {
      masked: true;
      depth: number;
    };

interface ForkAncestryRow {
  id: string;
  name: string | null;
  username: string | null;
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  depth: number;
}

/**
 * Walk a deck's fork chain (`forkedFromId`) up to `maxDepth` ancestors using a
 * single recursive CTE. PRIVATE ancestors are masked inside the query — their
 * name/username/id are returned as NULL — so callers can render a placeholder
 * without ever seeing the row's identifying data.
 *
 * Returns the ancestors closest-first (depth 1 = direct parent).
 */
export async function getForkAncestry(
  deckId: string,
  maxDepth = 5,
): Promise<ForkAncestor[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(deckTag(deckId));

  // Recursive CTE walks `forked_from_id` pointers, capping at maxDepth.
  // The outer SELECT joins each ancestor's owner and applies the PRIVATE mask
  // by returning NULL for identifying columns — never returning the data and
  // filtering in JS.
  const rows = await prisma.$queryRaw<ForkAncestryRow[]>`
    WITH RECURSIVE ancestry AS (
      SELECT
        d.id,
        d.forked_from_id,
        d.user_id,
        d.name,
        d.visibility,
        1 AS depth
      FROM deck d
      WHERE d.id = ${deckId}
        AND d.forked_from_id IS NOT NULL
      UNION ALL
      SELECT
        parent.id,
        parent.forked_from_id,
        parent.user_id,
        parent.name,
        parent.visibility,
        a.depth + 1
      FROM deck parent
      JOIN ancestry a ON a.forked_from_id = parent.id
      WHERE a.depth < ${maxDepth}
    ),
    parents AS (
      SELECT
        a.depth,
        parent.id,
        parent.name,
        parent.visibility,
        u.username
      FROM ancestry a
      JOIN deck parent ON parent.id = a.forked_from_id
      JOIN "user" u ON u.id = parent.user_id
    )
    SELECT
      CASE WHEN p.visibility = 'PRIVATE' THEN NULL ELSE p.id END AS id,
      CASE WHEN p.visibility = 'PRIVATE' THEN NULL ELSE p.name END AS name,
      CASE WHEN p.visibility = 'PRIVATE' THEN NULL ELSE p.username END AS username,
      p.visibility AS visibility,
      p.depth AS depth
    FROM parents p
    ORDER BY p.depth ASC
  `;

  return rows.map((row) => {
    if (row.visibility === "PRIVATE") {
      return { masked: true, depth: Number(row.depth) };
    }
    return {
      masked: false,
      id: row.id as string,
      name: row.name as string,
      username: row.username as string,
      depth: Number(row.depth),
    };
  });
}

export interface PublicForkSummary {
  id: string;
  name: string;
  format: import("@/lib/generated/prisma/enums").Format;
  updatedAt: Date;
  user: { username: string; image: string | null };
}

export const PUBLIC_FORKS_PAGE_SIZE = 12;

/**
 * Paginated public forks of a deck. Filters to `visibility = PUBLIC` and
 * `externalSource IS NULL` so future precon reissues do not pollute the rail.
 * Returns `{ forks, total }` so callers can render "Forks (N)" and pagination.
 */
export async function getPublicForks(
  deckId: string,
  page: number,
): Promise<{ forks: PublicForkSummary[]; total: number }> {
  "use cache";
  cacheLife("minutes");
  cacheTag(forkLineageTag(deckId));

  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * PUBLIC_FORKS_PAGE_SIZE;

  const where: Prisma.DeckWhereInput = {
    forkedFromId: deckId,
    visibility: "PUBLIC",
    externalSource: null,
  };

  const [forks, total] = await Promise.all([
    prisma.deck.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: PUBLIC_FORKS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        format: true,
        updatedAt: true,
        user: { select: { username: true, image: true } },
      },
    }),
    prisma.deck.count({ where }),
  ]);

  return { forks, total };
}

/**
 * Returns the chain of ancestor IDs (closest first) for `deckId`, walking the
 * `forked_from_id` pointers up to `maxDepth`. Used by mutations (e.g.
 * `duplicateDeck`) to bump `forkLineageTag` on each ancestor so their fork
 * rails invalidate. Single SQL round-trip.
 */
export async function getForkAncestorIds(
  deckId: string,
  maxDepth = 5,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string; depth: number }[]>`
    WITH RECURSIVE ancestry AS (
      SELECT id, forked_from_id, 1 AS depth
      FROM deck
      WHERE id = ${deckId} AND forked_from_id IS NOT NULL
      UNION ALL
      SELECT parent.id, parent.forked_from_id, a.depth + 1
      FROM deck parent
      JOIN ancestry a ON a.forked_from_id = parent.id
      WHERE a.depth < ${maxDepth}
    )
    SELECT a.forked_from_id AS id, a.depth AS depth
    FROM ancestry a
    WHERE a.forked_from_id IS NOT NULL
    ORDER BY a.depth ASC
  `;
  return rows.map((r) => r.id);
}
