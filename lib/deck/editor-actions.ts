"use server";

import { requireDeckOwner } from "@/lib/auth/deck-access";
import { Zone } from "@/lib/generated/prisma/client";
import {
  applyChanges,
  InvariantViolation,
  type PlannedChange,
} from "@/lib/deck/mutation";

export type BulkChange = PlannedChange;

export async function addCardToDeck(
  deckId: string,
  cardId: number,
  opts?: { quantity?: number; zone?: Zone; category?: string | null },
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);

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
}

export async function removeCardFromDeck(
  deckId: string,
  deckCardId: string,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);
  await applyChanges(deckId, userId, [{ op: "remove", deckCardId }]);
}

export async function updateCardQuantity(
  deckId: string,
  deckCardId: string,
  quantity: number,
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);
  await applyChanges(deckId, userId, [
    { op: "update", deckCardId, quantity },
  ]);
}

export async function bulkUpdateDeck(
  deckId: string,
  changes: BulkChange[],
): Promise<void> {
  const { userId } = await requireDeckOwner(deckId);
  await applyChanges(deckId, userId, changes);
}
