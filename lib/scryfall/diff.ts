import type {
  CardCreateData,
  PrintingCreateData,
} from "@/lib/scryfall/map";
import { toCardCreate } from "@/lib/scryfall/map";
import type { ScryfallCard } from "@/lib/scryfall/types";
import { logWarn } from "@/lib/telemetry";

/**
 * Existing Card columns the diff needs. Provided by the caller (Prisma
 * `findMany`) so the diff itself stays storage-free.
 */
export type ExistingCardRow = {
  id: number;
  name: string;
  version: string | null;
  nameSlug: string | null;
};

export type ExistingPrintingRow = {
  scryfallId: string;
  version: string | null;
};

export type CardDiff = {
  toInsert: CardCreateData[];
  toUpdate: CardCreateData[];
  unchangedIds: Map<string, number>;
  updateIds: Map<string, number>;
};

export type PrintingDiff = {
  toInsert: PrintingCreateData[];
  toUpdate: PrintingCreateData[];
  unchanged: number;
};

/**
 * Collapse a Scryfall card batch by name, dropping later cards that collide
 * on `nameSlug` with an earlier card (the slug-unique constraint would reject
 * the second insert and break the batch).
 */
export function dedupeCards(
  cards: readonly ScryfallCard[],
): Map<string, CardCreateData> {
  const cardByName = new Map<string, CardCreateData>();
  const slugSeen = new Map<string, string>();
  for (const c of cards) {
    const create = toCardCreate(c);
    if (cardByName.has(create.name)) continue;
    const slug = create.nameSlug;
    if (slug) {
      const existingName = slugSeen.get(slug);
      if (existingName !== undefined && existingName !== create.name) {
        logWarn(
          {
            source: "scryfall.diff",
            slug,
            kept: existingName,
            dropped: create.name,
          },
          "slug collision within batch — dropping later card",
        );
        continue;
      }
      slugSeen.set(slug, create.name);
    }
    cardByName.set(create.name, create);
  }
  return cardByName;
}

/**
 * Split incoming cards into insert / update / unchanged buckets vs. the
 * given existing rows. Cards whose slug is already owned by a different
 * existing card are dropped (and a warning is logged) — not inserted.
 */
export function diffCards(
  incoming: Map<string, CardCreateData>,
  existing: readonly ExistingCardRow[],
): CardDiff {
  const existingByName = new Map(existing.map((e) => [e.name, e] as const));
  const existingBySlug = new Map(
    existing
      .filter((e): e is ExistingCardRow & { nameSlug: string } =>
        e.nameSlug !== null,
      )
      .map((e) => [e.nameSlug, e] as const),
  );

  const diff: CardDiff = {
    toInsert: [],
    toUpdate: [],
    unchangedIds: new Map(),
    updateIds: new Map(),
  };

  for (const [name, create] of incoming) {
    const found = existingByName.get(name);
    if (found) {
      if (found.version !== create.version || found.nameSlug === null) {
        diff.toUpdate.push(create);
        diff.updateIds.set(name, found.id);
      } else {
        diff.unchangedIds.set(name, found.id);
      }
      continue;
    }
    const slugOwner = create.nameSlug
      ? existingBySlug.get(create.nameSlug)
      : undefined;
    if (slugOwner) {
      logWarn(
        {
          source: "scryfall.diff",
          slug: create.nameSlug,
          kept: slugOwner.name,
          dropped: create.name,
        },
        "slug already owned by another card — skipping insert",
      );
      continue;
    }
    diff.toInsert.push(create);
  }
  return diff;
}

/**
 * Split incoming printings into insert / update / unchanged buckets vs. the
 * given existing rows (keyed by `scryfallId`).
 */
export function diffPrintings(
  incoming: readonly PrintingCreateData[],
  existing: readonly ExistingPrintingRow[],
): PrintingDiff {
  const versionById = new Map(
    existing.map((e) => [e.scryfallId, e.version] as const),
  );

  const diff: PrintingDiff = { toInsert: [], toUpdate: [], unchanged: 0 };
  for (const p of incoming) {
    const v = versionById.get(p.scryfallId);
    if (v === undefined) diff.toInsert.push(p);
    else if (v !== p.version) diff.toUpdate.push(p);
    else diff.unchanged += 1;
  }
  return diff;
}
