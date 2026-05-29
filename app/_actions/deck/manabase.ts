"use server";

import { Zone } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  applyChanges,
  runOwnerDeckMutation,
  type PlannedChange,
} from "@/lib/deck/mutation";
import { addLandsSchema, type AddLandsInput } from "@/lib/deck/forms";
import {
  getBasicLandCardIds,
  getBasicLandImages,
  getLandCandidates,
  type LandCandidate,
} from "@/lib/deck/manabase/candidates";
import type { LandCycleId } from "@/lib/deck/manabase/cycles";
import { requireDeckOwner } from "@/lib/auth/deck-access";

const BASIC_COLORS = ["W", "U", "B", "R", "G", "C"] as const;

/**
 * Add lands to a deck's MAINBOARD, uncategorized. Each nonbasic pick and each
 * nonzero basic count becomes an `add` change; `applyChanges` merges into any
 * existing `(cardId, MAINBOARD, null)` row, so re-adding increments rather than
 * duplicating.
 */
export const addLandsToDeck = runOwnerDeckMutation(
  "deck.addLands",
  "none",
  async ({ deckId, userId }, input: AddLandsInput): Promise<void> => {
    const { picks, basics } = addLandsSchema.parse(input);

    const changes: PlannedChange[] = [];

    for (const pick of picks) {
      if (pick.quantity <= 0) continue;
      changes.push({
        op: "add",
        cardId: pick.cardId,
        quantity: pick.quantity,
        zone: Zone.MAINBOARD,
        category: null,
      });
    }

    const hasBasics = BASIC_COLORS.some((c) => basics[c] > 0);
    if (hasBasics) {
      const basicIds = await getBasicLandCardIds();
      for (const color of BASIC_COLORS) {
        const quantity = basics[color];
        if (quantity <= 0) continue;
        changes.push({
          op: "add",
          cardId: basicIds[color],
          quantity,
          zone: Zone.MAINBOARD,
          category: null,
        });
      }
    }

    if (changes.length === 0) return;

    await applyChanges(deckId, userId, changes);
  },
);

export interface LandCandidatesResult {
  colorIdentity: string[];
  candidates: Record<LandCycleId, LandCandidate[]>;
  basicImages: Record<"W" | "U" | "B" | "R" | "G" | "C", string>;
}

/**
 * Resolve the deck's color identity (union of commander + mainboard card color
 * identities) and the nonbasic land candidates legal under it, bucketed by
 * cycle. Invoked lazily when the Add-lands dialog opens.
 *
 * Identity is resolved server-side from the deck rather than trusting a
 * client-computed value, so a commander-only deck still scopes lands to the
 * commander's colors.
 */
export async function getLandCandidatesAction(
  deckId: string,
): Promise<LandCandidatesResult> {
  await requireDeckOwner(deckId);

  const [deck, rows] = await Promise.all([
    prisma.deck.findUniqueOrThrow({
      where: { id: deckId },
      select: { format: true },
    }),
    prisma.deckCard.findMany({
      where: { deckId, zone: { in: [Zone.MAINBOARD, Zone.COMMANDER] } },
      select: { card: { select: { colorIdentity: true } } },
    }),
  ]);

  const colorIdentity = [
    ...new Set(rows.flatMap((r) => r.card.colorIdentity)),
  ];

  const [candidates, basicImages] = await Promise.all([
    getLandCandidates(colorIdentity, deck.format),
    getBasicLandImages(),
  ]);

  return { colorIdentity, candidates, basicImages };
}
