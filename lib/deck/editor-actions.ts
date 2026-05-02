"use server";

import { Zone } from "@/lib/generated/prisma/client";
import {
  applyChanges,
  InvariantViolation,
  type PlannedChange,
  runOwnerDeckMutation,
} from "@/lib/deck/mutation";

export type BulkChange = PlannedChange;

export const addCardToDeck = runOwnerDeckMutation(
  "deck.addCard",
  "none",
  async (
    { deckId, userId },
    cardId: number,
    opts?: { quantity?: number; zone?: Zone; category?: string | null },
  ): Promise<void> => {
    const quantity = opts?.quantity ?? 1;
    const zone = opts?.zone ?? Zone.MAINBOARD;
    const category = opts?.category ?? null;

    if (category !== null && zone !== Zone.MAINBOARD) {
      throw new Error("Subcategories only apply to MAINBOARD cards");
    }

    try {
      await applyChanges(deckId, userId, [
        { op: "add", cardId, quantity, zone, category },
      ]);
    } catch (err) {
      if (err instanceof InvariantViolation) return;
      throw err;
    }
  },
);

export const removeCardFromDeck = runOwnerDeckMutation(
  "deck.removeCard",
  "none",
  async ({ deckId, userId }, deckCardId: string): Promise<void> => {
    await applyChanges(deckId, userId, [{ op: "remove", deckCardId }]);
  },
);

export const updateCardQuantity = runOwnerDeckMutation(
  "deck.updateCardQuantity",
  "none",
  async (
    { deckId, userId },
    deckCardId: string,
    quantity: number,
  ): Promise<void> => {
    await applyChanges(deckId, userId, [
      { op: "update", deckCardId, quantity },
    ]);
  },
);

export const bulkUpdateDeck = runOwnerDeckMutation(
  "deck.bulkUpdate",
  "none",
  async ({ deckId, userId }, changes: BulkChange[]): Promise<void> => {
    await applyChanges(deckId, userId, changes);
  },
);
