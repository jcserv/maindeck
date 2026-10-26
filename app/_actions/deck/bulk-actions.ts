"use server";

import { prisma } from "@/lib/db";
import { normalizeCategory } from "@/lib/deck/constants";
import { applyChanges, runOwnerDeckMutation } from "@/lib/deck/mutation";
import {
  planBulkCardAction,
  type BulkCardAction,
  type BulkSelectionTarget,
} from "@/lib/deck/bulk-actions";

function normalizeAction(action: BulkCardAction): BulkCardAction {
  switch (action.kind) {
    case "setPrimaryCategory":
      return {
        ...action,
        category:
          action.category === null ? null : normalizeCategory(action.category),
      };
    case "addCategory":
    case "removeCategory":
      return { ...action, category: normalizeCategory(action.category) };
    default:
      return action;
  }
}

export const applyBulkCardAction = runOwnerDeckMutation(
  "deck.applyBulkCardAction",
  "none",
  async (
    { deckId, userId },
    targets: BulkSelectionTarget[],
    rawAction: BulkCardAction,
  ): Promise<void> => {
    const action = normalizeAction(rawAction);
    const ids = [...new Set(targets.map((t) => t.deckCardId))];

    const [rows, categories] = await Promise.all([
      prisma.deckCard.findMany({
        where: { deckId, id: { in: ids } },
        select: {
          id: true,
          zone: true,
          categoryLinks: {
            select: { deckCategory: { select: { name: true } } },
            orderBy: { position: "asc" },
          },
        },
      }),
      prisma.deckCategory.findMany({
        where: { deckId },
        select: { name: true },
      }),
    ]);

    const changes = planBulkCardAction(
      rows.map((r) => ({
        id: r.id,
        zone: r.zone,
        categories: r.categoryLinks.map((l) => l.deckCategory.name),
      })),
      targets,
      action,
      new Set(categories.map((c) => c.name)),
    );
    if (changes.length === 0) return;

    await applyChanges(deckId, userId, changes);
  },
);
