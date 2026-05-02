"use server";

import { prisma } from "@/lib/db";
import { Zone } from "@/lib/generated/prisma/client";
import { applyChanges, runOwnerDeckMutation } from "@/lib/deck/mutation";
import {
  categoryDeleteModeSchema,
  categoryNameSchema,
  reorderCategoriesSchema,
  type CategoryDeleteMode,
} from "@/lib/validation/deck";

/** Create a Mainboard subcategory. Subcategories only apply to MAINBOARD zone. */
export const createCategory = runOwnerDeckMutation(
  "deck.createCategory",
  "category",
  async (
    { deckId },
    name: string,
  ): Promise<{ id: string; name: string; sortOrder: number }> => {
    const trimmed = categoryNameSchema.parse(name);

    const last = await prisma.deckCategory.findFirst({
      where: { deckId },
      select: { sortOrder: true },
      orderBy: { sortOrder: "desc" },
    });

    const maxOrder = last?.sortOrder ?? -1;

    return prisma.deckCategory.create({
      data: {
        deckId,
        name: trimmed,
        sortOrder: maxOrder + 1,
      },
      select: { id: true, name: true, sortOrder: true },
    });
  },
);

/**
 * Delete a Mainboard subcategory. Behavior depends on `mode`:
 * - `"uncategorize"` (default): cards in MAINBOARD pointing at this subcategory
 *   get their `category` nulled out (they stay in Mainboard, just uncategorized).
 * - `"deleteCards"`: MAINBOARD rows with this subcategory are deleted; cards in
 *   other zones that still reference this name are kept but uncategorized.
 *
 * In both modes, the DeckCategory row itself is deleted in the same transaction.
 */
export const deleteCategory = runOwnerDeckMutation(
  "deck.deleteCategory",
  "category",
  async (
    { deckId },
    categoryName: string,
    mode: CategoryDeleteMode = "uncategorize",
  ): Promise<void> => {
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
          where: {
            deckId,
            zone: { not: Zone.MAINBOARD },
            category: categoryName,
          },
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
  },
);

/** Atomically rename a subcategory and every DeckCard row that references it. */
export const renameCategory = runOwnerDeckMutation(
  "deck.renameCategory",
  "category",
  async (
    { deckId },
    oldName: string,
    newName: string,
  ): Promise<void> => {
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
  },
);

export const reorderCategories = runOwnerDeckMutation(
  "deck.reorderCategories",
  "category",
  async ({ deckId }, orderedNames: string[]): Promise<void> => {
    const parsed = reorderCategoriesSchema.parse(orderedNames);

    const categories = await prisma.deckCategory.findMany({
      where: { deckId },
      select: { id: true, name: true },
    });

    const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

    for (const name of parsed) {
      if (!categoryByName.has(name)) {
        throw new Error(`Category "${name}" not found in deck`);
      }
    }

    await prisma.$transaction(
      parsed.map((name, index) =>
        prisma.deckCategory.update({
          where: { id: categoryByName.get(name)! },
          data: { sortOrder: index },
        }),
      ),
    );
  },
);

/**
 * Move a card between zones. Preserves the card's `category` string so a
 * Mainboard→Sideboard→Mainboard roundtrip snaps back to the original subcategory.
 * When returning to MAINBOARD, falls back to `category = null` if the preserved
 * subcategory no longer exists in this deck.
 */
export const moveCardZone = runOwnerDeckMutation(
  "deck.moveCardZone",
  "none",
  async (
    { deckId, userId },
    deckCardId: string,
    nextZone: Zone,
  ): Promise<void> => {
    const sourceCard = await prisma.deckCard.findUnique({
      where: { id: deckCardId },
      select: { id: true, deckId: true, zone: true, category: true },
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
      // Non-mainboard zones can't carry a subcategory.
      nextCategory = null;
    }

    await applyChanges(deckId, userId, [
      { op: "move", deckCardId, zone: nextZone, category: nextCategory },
    ]);
  },
);

/**
 * Move a card to a specific zone and (for MAINBOARD) subcategory. Thin wrapper
 * so drag-and-drop callers route through one entrypoint.
 */
export const moveCardTo = runOwnerDeckMutation(
  "deck.moveCardTo",
  "none",
  async (
    { deckId, userId },
    deckCardId: string,
    nextZone: Zone,
    nextCategory: string | null,
  ): Promise<void> => {
    if (nextCategory !== null && nextZone !== Zone.MAINBOARD) {
      throw new Error("Subcategories only apply to MAINBOARD cards");
    }

    const sourceCard = await prisma.deckCard.findUnique({
      where: { id: deckCardId },
      select: { id: true, deckId: true, zone: true, category: true },
    });

    if (!sourceCard || sourceCard.deckId !== deckId) {
      throw new Error("Card not found or unauthorized");
    }

    if (nextZone === Zone.MAINBOARD && nextCategory !== null) {
      const exists = await prisma.deckCategory.findUnique({
        where: { deckId_name: { deckId, name: nextCategory } },
        select: { id: true },
      });
      if (!exists) {
        throw new Error(`Category "${nextCategory}" not found in deck`);
      }
    }

    if (sourceCard.zone === nextZone && sourceCard.category === nextCategory) {
      return;
    }

    await applyChanges(deckId, userId, [
      { op: "move", deckCardId, zone: nextZone, category: nextCategory },
    ]);
  },
);

/**
 * Change a MAINBOARD card's subcategory. Passing `null` makes it uncategorized.
 * Validates that the subcategory exists in this deck.
 */
export const moveCardSubcategory = runOwnerDeckMutation(
  "deck.moveCardSubcategory",
  "none",
  async (
    { deckId, userId },
    deckCardId: string,
    nextCategory: string | null,
  ): Promise<void> => {
    const sourceCard = await prisma.deckCard.findUnique({
      where: { id: deckCardId },
      select: { id: true, deckId: true, zone: true, category: true },
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

    await applyChanges(deckId, userId, [
      {
        op: "move",
        deckCardId,
        zone: Zone.MAINBOARD,
        category: nextCategory,
      },
    ]);
  },
);
