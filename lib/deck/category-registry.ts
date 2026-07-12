import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Create any missing `DeckCategory` rows for `names`, appended after the
 * deck's current max sortOrder in the order given. Existing names are left
 * untouched. Runs against the caller's transaction so registry creation
 * commits or rolls back with the writes that depend on it.
 */
export async function ensureDeckCategories(
  tx: Prisma.TransactionClient,
  deckId: string,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) return;

  const existing = await tx.deckCategory.findMany({
    where: { deckId },
    select: { name: true, sortOrder: true },
  });
  const known = new Set(existing.map((c) => c.name));
  const missing = [...new Set(names)].filter((name) => !known.has(name));
  if (missing.length === 0) return;

  let nextOrder =
    existing.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;
  await tx.deckCategory.createMany({
    data: missing.map((name) => ({ deckId, name, sortOrder: nextOrder++ })),
    skipDuplicates: true,
  });
}
