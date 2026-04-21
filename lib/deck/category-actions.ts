"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requireDeckOwner } from "@/lib/auth/deck-access";
import { invalidateDeck } from "@/lib/deck/invalidation";
import { Zone } from "@/lib/generated/prisma/client";
import {
  categoryDeleteModeSchema,
  categoryNameSchema,
  reorderCategoriesSchema,
  type CategoryDeleteMode,
} from "@/lib/validation/deck";

/** Create a Mainboard subcategory. Subcategories only apply to MAINBOARD zone. */
export async function createCategory(
  deckId: string,
  name: string,
): Promise<{ id: string; name: string; sortOrder: number }> {
  const { userId } = await requireDeckOwner(deckId);
  const trimmed = categoryNameSchema.parse(name);

  const last = await prisma.deckCategory.findFirst({
    where: { deckId },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });

  const maxOrder = last?.sortOrder ?? -1;

  const category = await prisma.deckCategory.create({
    data: {
      deckId,
      name: trimmed,
      sortOrder: maxOrder + 1,
    },
    select: { id: true, name: true, sortOrder: true },
  });

  updateTag(`deck:${deckId}`);
  await invalidateDeck(deckId, userId);
  return category;
}

/**
 * Delete a Mainboard subcategory. Behavior depends on `mode`:
 * - `"uncategorize"` (default): cards in MAINBOARD pointing at this subcategory
 *   get their `category` nulled out (they stay in Mainboard, just uncategorized).
 * - `"deleteCards"`: MAINBOARD rows with this subcategory are deleted; cards in
 *   other zones that still reference this name are kept but uncategorized.
 *
 * In both modes, the DeckCategory row itself is deleted in the same transaction.
 */
export async function deleteCategory(
  deckId: string,
  categoryName: string,
  mode: CategoryDeleteMode = "uncategorize",
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);
  const parsedMode = categoryDeleteModeSchema.parse(mode);

  const category = await prisma.deckCategory.findUnique({
    where: { deckId_name: { deckId, name: categoryName } },
    select: { id: true },
  });

  if (!category) {
    throw new Error(`Category "${categoryName}" not found`);
  }

  await prisma.$transaction(async (tx) => {
    if (parsedMode === "deleteCards") {
      await tx.deckCard.deleteMany({
        where: { deckId, zone: Zone.MAINBOARD, category: categoryName },
      });
      await tx.deckCard.updateMany({
        where: { deckId, zone: { not: Zone.MAINBOARD }, category: categoryName },
        data: { category: null },
      });
    } else {
      await tx.deckCard.updateMany({
        where: { deckId, zone: Zone.MAINBOARD, category: categoryName },
        data: { category: null },
      });
    }
    await tx.deckCategory.delete({ where: { id: category.id } });
  });

  updateTag(`deck:${deckId}`);
  await invalidateDeck(deckId, userId);
}

/** Atomically rename a subcategory and every DeckCard row that references it. */
export async function renameCategory(
  deckId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);
  const trimmed = categoryNameSchema.parse(newName);
  if (trimmed === oldName) return;

  const category = await prisma.deckCategory.findUnique({
    where: { deckId_name: { deckId, name: oldName } },
    select: { id: true },
  });
  if (!category) {
    throw new Error(`Category "${oldName}" not found`);
  }

  const conflict = await prisma.deckCategory.findUnique({
    where: { deckId_name: { deckId, name: trimmed } },
    select: { id: true },
  });
  if (conflict) {
    throw new Error(`Category "${trimmed}" already exists`);
  }

  await prisma.$transaction([
    prisma.deckCategory.update({
      where: { id: category.id },
      data: { name: trimmed },
    }),
    prisma.deckCard.updateMany({
      where: { deckId, category: oldName },
      data: { category: trimmed },
    }),
  ]);

  updateTag(`deck:${deckId}`);
  await invalidateDeck(deckId, userId);
}

export async function reorderCategories(
  deckId: string,
  orderedNames: string[],
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);
  orderedNames = reorderCategoriesSchema.parse(orderedNames);

  const categories = await prisma.deckCategory.findMany({
    where: { deckId },
    select: { id: true, name: true },
  });

  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

  for (const name of orderedNames) {
    if (!categoryByName.has(name)) {
      throw new Error(`Category "${name}" not found in deck`);
    }
  }

  await prisma.$transaction(
    orderedNames.map((name, index) =>
      prisma.deckCategory.update({
        where: { id: categoryByName.get(name)! },
        data: { sortOrder: index },
      }),
    ),
  );

  updateTag(`deck:${deckId}`);
  await invalidateDeck(deckId, userId);
}

async function mergeOrMove(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  deckId: string,
  deckCardId: string,
  cardId: number,
  quantity: number,
  nextZone: Zone,
  nextCategory: string | null,
): Promise<void> {
  const existing = await tx.deckCard.findFirst({
    where: { deckId, cardId, zone: nextZone, category: nextCategory },
    select: { id: true },
  });

  if (existing && existing.id !== deckCardId) {
    await tx.deckCard.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } },
    });
    await tx.deckCard.delete({ where: { id: deckCardId } });
  } else {
    await tx.deckCard.update({
      where: { id: deckCardId },
      data: { zone: nextZone, category: nextCategory },
    });
  }
}

/**
 * Move a card between zones. Preserves the card's `category` string so a
 * Mainboard→Sideboard→Mainboard roundtrip snaps back to the original subcategory.
 * When returning to MAINBOARD, falls back to `category = null` if the preserved
 * subcategory no longer exists in this deck.
 */
export async function moveCardZone(
  deckId: string,
  deckCardId: string,
  nextZone: Zone,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

  const sourceCard = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    select: {
      id: true,
      deckId: true,
      cardId: true,
      quantity: true,
      zone: true,
      category: true,
    },
  });

  if (!sourceCard || sourceCard.deckId !== deckId) {
    throw new Error("Card not found or unauthorized");
  }

  if (sourceCard.zone === nextZone) return;

  let nextCategory = sourceCard.category;
  if (nextZone === Zone.MAINBOARD && nextCategory !== null) {
    const exists = await prisma.deckCategory.findUnique({
      where: { deckId_name: { deckId, name: nextCategory } },
      select: { id: true },
    });
    if (!exists) nextCategory = null;
  }
  if (nextZone !== Zone.MAINBOARD) {
    // Non-mainboard zones preserve the string but it has no UI effect; we keep
    // it so returning to Mainboard can snap back.
  }

  await prisma.$transaction(async (tx) => {
    await mergeOrMove(
      tx,
      deckId,
      deckCardId,
      sourceCard.cardId,
      sourceCard.quantity,
      nextZone,
      nextCategory,
    );
  });

  updateTag(`deck:${deckId}`);
  await invalidateDeck(deckId, userId);
}

/**
 * Move a card to a specific zone and (for MAINBOARD) subcategory. Thin wrapper
 * so drag-and-drop callers route through one entrypoint. Combined moves
 * (zone + subcategory in one drop) run as a single transactional update to
 * emit just one cache invalidation.
 */
export async function moveCardTo(
  deckId: string,
  deckCardId: string,
  nextZone: Zone,
  nextCategory: string | null,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

  if (nextCategory !== null && nextZone !== Zone.MAINBOARD) {
    throw new Error("Subcategories only apply to MAINBOARD cards");
  }

  const sourceCard = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    select: {
      id: true,
      deckId: true,
      cardId: true,
      quantity: true,
      zone: true,
      category: true,
    },
  });

  if (!sourceCard || sourceCard.deckId !== deckId) {
    throw new Error("Card not found or unauthorized");
  }

  const resolvedCategory = nextCategory;
  if (nextZone === Zone.MAINBOARD && resolvedCategory !== null) {
    const exists = await prisma.deckCategory.findUnique({
      where: { deckId_name: { deckId, name: resolvedCategory } },
      select: { id: true },
    });
    if (!exists) {
      throw new Error(`Category "${resolvedCategory}" not found in deck`);
    }
  }

  if (sourceCard.zone === nextZone && sourceCard.category === resolvedCategory) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await mergeOrMove(
      tx,
      deckId,
      deckCardId,
      sourceCard.cardId,
      sourceCard.quantity,
      nextZone,
      resolvedCategory,
    );
  });

  updateTag(`deck:${deckId}`);
  await invalidateDeck(deckId, userId);
}

/**
 * Change a MAINBOARD card's subcategory. Passing `null` makes it uncategorized.
 * Validates that the subcategory exists in this deck.
 */
export async function moveCardSubcategory(
  deckId: string,
  deckCardId: string,
  nextCategory: string | null,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

  const sourceCard = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    select: {
      id: true,
      deckId: true,
      cardId: true,
      quantity: true,
      zone: true,
      category: true,
    },
  });

  if (!sourceCard || sourceCard.deckId !== deckId) {
    throw new Error("Card not found or unauthorized");
  }

  if (sourceCard.zone !== Zone.MAINBOARD) {
    throw new Error("Subcategories only apply to MAINBOARD cards");
  }

  if (nextCategory !== null) {
    const exists = await prisma.deckCategory.findUnique({
      where: { deckId_name: { deckId, name: nextCategory } },
      select: { id: true },
    });
    if (!exists) {
      throw new Error(`Category "${nextCategory}" not found in deck`);
    }
  }

  if (sourceCard.category === nextCategory) return;

  await prisma.$transaction(async (tx) => {
    await mergeOrMove(
      tx,
      deckId,
      deckCardId,
      sourceCard.cardId,
      sourceCard.quantity,
      Zone.MAINBOARD,
      nextCategory,
    );
  });

  updateTag(`deck:${deckId}`);
  await invalidateDeck(deckId, userId);
}
