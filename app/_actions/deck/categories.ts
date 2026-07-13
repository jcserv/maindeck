"use server";

import { prisma } from "@/lib/db";
import { Zone } from "@/lib/generated/prisma/client";
import { normalizeCategory } from "@/lib/deck/constants";
import { ensureDeckCategories } from "@/lib/deck/category-registry";
import { applyChanges, runOwnerDeckMutation } from "@/lib/deck/mutation";
import {
  categoryDeleteModeSchema,
  categoryNameSchema,
  reorderCategoriesSchema,
  type CategoryDeleteMode,
} from "@/lib/deck/forms";
import {
  classifyCard,
  type AutogenPreset,
} from "@/lib/deck/category-autogen";

/**
 * A MAINBOARD card's ordered memberships, `[0]` = primary. Cards can belong to
 * several subcategories; the primary is where the card renders in full (and
 * what section counts tally) — secondaries render ghosted.
 */
type MemberRow = { id: string; categories: string[] };

async function loadCategoryMembers(
  deckId: string,
  categoryName: string,
  client: Pick<typeof prisma, "deckCard"> = prisma,
): Promise<MemberRow[]> {
  const rows = await client.deckCard.findMany({
    where: {
      deckId,
      zone: Zone.MAINBOARD,
      categoryLinks: { some: { deckCategory: { name: categoryName } } },
    },
    select: {
      id: true,
      categoryLinks: {
        select: { deckCategory: { select: { name: true } } },
        orderBy: { position: "asc" },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    categories: r.categoryLinks.map((l) => l.deckCategory.name),
  }));
}

async function assertCategoryExists(
  deckId: string,
  name: string,
): Promise<void> {
  const exists = await prisma.deckCategory.findUnique({
    where: { deckId_name: { deckId, name } },
    select: { id: true },
  });
  if (!exists) {
    throw new Error(`Category "${name}" not found in deck`);
  }
}

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
 * - `"uncategorize"` (default): the DeckCategory row is deleted and the FK
 *   cascade removes every membership. Cards keep their other memberships;
 *   for cards whose primary was this category, the next membership (if any)
 *   auto-promotes on read.
 * - `"deleteCards"`: DeckCards whose *primary* membership is this category are
 *   removed from the deck (through `applyChanges`, so the revision history
 *   records it). Secondary members just lose the membership via the cascade.
 */
export const deleteCategory = runOwnerDeckMutation(
  "deck.deleteCategory",
  "category",
  async (
    { deckId, userId },
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

    if (parsedMode === "deleteCards") {
      // One transaction: if the registry delete fails, the card removals roll
      // back with it instead of leaving the deck gutted but the category alive.
      await prisma.$transaction(async (tx) => {
        const members = await loadCategoryMembers(deckId, categoryName, tx);
        const primaryMembers = members.filter(
          (m) => m.categories[0] === categoryName,
        );
        if (primaryMembers.length > 0) {
          await applyChanges(
            deckId,
            userId,
            primaryMembers.map((m) => ({
              op: "remove" as const,
              deckCardId: m.id,
            })),
            { tx },
          );
        }
        await tx.deckCategory.delete({ where: { id: category.id } });
      });
      return;
    }

    await prisma.deckCategory.delete({ where: { id: category.id } });
  },
);

/**
 * Rename a subcategory. Memberships follow the `DeckCategory.id`, so only the
 * registry row changes.
 */
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

    await prisma.deckCategory.update({
      where: { id: category.id },
      data: { name: trimmed },
    });
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
 * Move a card between zones. Leaving MAINBOARD clears all category
 * memberships (subcategories are MAINBOARD-only).
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
      select: { id: true, deckId: true, zone: true },
    });

    if (!sourceCard || sourceCard.deckId !== deckId) {
      throw new Error("Card not found or unauthorized");
    }

    if (sourceCard.zone === nextZone) return;

    await applyChanges(deckId, userId, [
      { op: "move", deckCardId, zone: nextZone, categories: [] },
    ]);
  },
);

/**
 * Move a card to a specific zone and (for MAINBOARD) subcategory. Thin wrapper
 * so drag-and-drop callers route through one entrypoint. A MAINBOARD target
 * category becomes the card's primary while other memberships are preserved;
 * a null MAINBOARD target (the Uncategorized bucket) clears every membership.
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
    const normalizedCategory =
      nextCategory === null ? null : normalizeCategory(nextCategory);

    if (normalizedCategory !== null && nextZone !== Zone.MAINBOARD) {
      throw new Error("Subcategories only apply to MAINBOARD cards");
    }

    const sourceCard = await prisma.deckCard.findUnique({
      where: { id: deckCardId },
      select: {
        id: true,
        deckId: true,
        zone: true,
        categoryLinks: {
          select: { deckCategory: { select: { name: true } } },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!sourceCard || sourceCard.deckId !== deckId) {
      throw new Error("Card not found or unauthorized");
    }

    // If the target subcategory was deleted (by this user in another tab or
    // by a collaborator) between menu-open and dispatch, degrade to an
    // uncategorized MAINBOARD move rather than throwing, which would trip the
    // error boundary. See issue #88.
    let effectiveCategory = normalizedCategory;
    if (nextZone === Zone.MAINBOARD && normalizedCategory !== null) {
      const exists = await prisma.deckCategory.findUnique({
        where: { deckId_name: { deckId, name: normalizedCategory } },
        select: { id: true },
      });
      if (!exists) effectiveCategory = null;
    }

    const current = sourceCard.categoryLinks.map((l) => l.deckCategory.name);
    const nextCategories =
      nextZone !== Zone.MAINBOARD || effectiveCategory === null
        ? []
        : [
            effectiveCategory,
            ...current.filter((name) => name !== effectiveCategory),
          ];

    if (
      sourceCard.zone === nextZone &&
      current.join("\u0000") === nextCategories.join("\u0000")
    ) {
      return;
    }

    await applyChanges(deckId, userId, [
      { op: "move", deckCardId, zone: nextZone, categories: nextCategories },
    ]);
  },
);

/**
 * Replace a MAINBOARD card's category memberships wholesale. Order matters:
 * `categories[0]` is the primary. An empty array uncategorizes the card.
 * Validates every name against the deck's category registry.
 */
export const setCardCategories = runOwnerDeckMutation(
  "deck.setCardCategories",
  "none",
  async (
    { deckId, userId },
    deckCardId: string,
    categories: string[],
  ): Promise<void> => {
    const normalized: string[] = [];
    for (const raw of categories) {
      const name = normalizeCategory(raw);
      if (name.length === 0) continue;
      if (!normalized.includes(name)) normalized.push(name);
    }

    const sourceCard = await prisma.deckCard.findUnique({
      where: { id: deckCardId },
      select: {
        id: true,
        deckId: true,
        zone: true,
        categoryLinks: {
          select: { deckCategory: { select: { name: true } } },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!sourceCard || sourceCard.deckId !== deckId) {
      throw new Error("Card not found or unauthorized");
    }

    if (sourceCard.zone !== Zone.MAINBOARD) {
      throw new Error("Subcategories only apply to MAINBOARD cards");
    }

    let effective = normalized;
    if (normalized.length > 0) {
      const known = await prisma.deckCategory.findMany({
        where: { deckId, name: { in: normalized } },
        select: { name: true },
      });
      const knownNames = new Set(known.map((c) => c.name));
      // A category can be deleted (by this user in another tab or by a
      // collaborator) while a move-card menu still shows it. Silently drop
      // such stale names instead of throwing, which would trip the error
      // boundary. See issue #88.
      effective = normalized.filter((name) => knownNames.has(name));
    }

    const current = sourceCard.categoryLinks.map((l) => l.deckCategory.name);
    if (current.join("\u0000") === effective.join("\u0000")) return;

    await applyChanges(deckId, userId, [
      {
        op: "move",
        deckCardId,
        zone: Zone.MAINBOARD,
        categories: effective,
      },
    ]);
  },
);

/**
 * Bulk-move every DeckCard whose *primary* membership is `sourceCategory` to a
 * destination zone+subcategory in one mutation. A MAINBOARD destination swaps
 * the primary and keeps secondary memberships; non-mainboard destinations
 * clear all memberships (categories are MAINBOARD-only). The empty source
 * DeckCategory row is intentionally kept — deletion is a separate, explicit
 * action.
 */
export const moveCategoryCards = runOwnerDeckMutation(
  "deck.moveCategoryCards",
  "category",
  async (
    { deckId, userId },
    sourceCategory: string,
    targetZone: Zone,
    targetCategory: string | null,
  ): Promise<void> => {
    const normalizedTarget =
      targetCategory === null ? null : normalizeCategory(targetCategory);

    if (normalizedTarget !== null && targetZone !== Zone.MAINBOARD) {
      throw new Error("Subcategories only apply to MAINBOARD cards");
    }
    const nextPrimary =
      targetZone === Zone.MAINBOARD ? normalizedTarget : null;

    if (nextPrimary !== null) {
      await assertCategoryExists(deckId, nextPrimary);
    }

    const members = await loadCategoryMembers(deckId, sourceCategory);
    const primaryMembers = members.filter(
      (m) => m.categories[0] === sourceCategory,
    );
    if (primaryMembers.length === 0) return;

    // No-op: cards already lead with the destination category.
    if (targetZone === Zone.MAINBOARD && nextPrimary === sourceCategory) {
      return;
    }

    await applyChanges(
      deckId,
      userId,
      primaryMembers.map((m) => ({
        op: "move" as const,
        deckCardId: m.id,
        zone: targetZone,
        categories:
          nextPrimary === null
            ? []
            : [
                nextPrimary,
                ...m.categories.filter(
                  (name) => name !== sourceCategory && name !== nextPrimary,
                ),
              ],
      })),
    );
  },
);

/**
 * Automatically assign categories to MAINBOARD DeckCards by reclassifying
 * every card under the chosen preset. Existing memberships are overwritten so
 * switching presets reorganizes the deck as the user expects; cards the preset
 * can't classify keep their current memberships.
 *
 * Two presets:
 * - `"byType"` — buckets by `Card.mainType` (Creatures, Instants, …)
 * - `"commanderTemplate"` — priority-ordered oracle-text heuristic suitable for
 *   Commander: Lands → Ramp → Boardwipes → Removal → Card advantage → Gameplan
 */
export const autogenerateCategories = runOwnerDeckMutation(
  "deck.autogenerateCategories",
  "category",
  async ({ deckId, userId }, preset: AutogenPreset): Promise<void> => {
    const mainboardCards = await prisma.deckCard.findMany({
      where: { deckId, zone: Zone.MAINBOARD },
      select: {
        id: true,
        card: {
          select: {
            mainType: true,
            oracleText: true,
            keywords: true,
          },
        },
      },
    });

    if (mainboardCards.length === 0) return;

    const assignments = new Map<string, string[]>(); // categoryName → deckCardIds

    for (const dc of mainboardCards) {
      const categoryName = classifyCard(dc.card, preset);
      if (categoryName === null) continue;

      const normalized = normalizeCategory(categoryName);
      const ids = assignments.get(normalized) ?? [];
      ids.push(dc.id);
      assignments.set(normalized, ids);
    }

    if (assignments.size === 0) return;

    // Registry creation and the membership writes commit or roll back
    // together, so a mid-flight failure can't leave phantom categories.
    await prisma.$transaction(async (tx) => {
      await ensureDeckCategories(tx, deckId, [...assignments.keys()]);
      await applyChanges(
        deckId,
        userId,
        [...assignments].flatMap(([name, ids]) =>
          ids.map((deckCardId) => ({
            op: "move" as const,
            deckCardId,
            zone: Zone.MAINBOARD,
            categories: [name],
          })),
        ),
        { tx },
      );
    });
  },
);
