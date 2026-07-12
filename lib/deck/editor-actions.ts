"use server";

import { Zone } from "@/lib/generated/prisma/client";
import { normalizeCategory } from "@/lib/deck/constants";
import {
  applyChanges,
  InvariantViolation,
  type PlannedChange,
  runOwnerDeckMutation,
} from "@/lib/deck/mutation";

export type BulkChange = PlannedChange;

/** Normalize and dedupe caller-supplied membership names, dropping empties. */
function normalizeCategories(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of raw) {
    const normalized = normalizeCategory(name);
    if (normalized.length === 0) continue;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

export const addCardToDeck = runOwnerDeckMutation(
  "deck.addCard",
  "none",
  async (
    { deckId, userId },
    cardId: number,
    opts?: { quantity?: number; zone?: Zone; categories?: string[] },
  ): Promise<void> => {
    const quantity = opts?.quantity ?? 1;
    const zone = opts?.zone ?? Zone.MAINBOARD;
    const categories = normalizeCategories(opts?.categories ?? []);

    if (categories.length > 0 && zone !== Zone.MAINBOARD) {
      throw new Error("Subcategories only apply to MAINBOARD cards");
    }

    try {
      await applyChanges(deckId, userId, [
        { op: "add", cardId, quantity, zone, categories },
      ]);
    } catch (err) {
      if (err instanceof InvariantViolation) return;
      throw err;
    }
  },
);

export const addCardsToDeck = runOwnerDeckMutation(
  "deck.addCards",
  "none",
  async (
    { deckId, userId },
    cards: { cardId: number; quantity?: number; zone?: Zone; categories?: string[] }[],
    opts?: { zone?: Zone; categories?: string[] },
  ): Promise<void> => {
    const changes = cards.map((c) => {
      const zone = c.zone ?? opts?.zone ?? Zone.MAINBOARD;
      const categories = normalizeCategories(c.categories ?? opts?.categories ?? []);
      if (categories.length > 0 && zone !== Zone.MAINBOARD) {
        throw new Error("Subcategories only apply to MAINBOARD cards");
      }
      return { op: "add" as const, cardId: c.cardId, quantity: c.quantity ?? 1, zone, categories };
    });

    try {
      await applyChanges(deckId, userId, changes); // one tx + one revalidation
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
