"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { Visibility } from "@/lib/generated/prisma/client";
import {
  deckMetaMutationTagsAll,
  invalidateTags,
} from "@/lib/deck/cache-tags";
import { withActionLogging } from "@/lib/telemetry";
import { duplicateDeck } from "@/app/_actions/deck/duplicate";

/**
 * Fork a public WotC precon (`externalSource = "mtgjson"`) for the current user
 * and rename it `<Precon Name> upgrade`. Reuses {@link duplicateDeck} for the
 * actual fork (`forkedFromId`, `visibility = PRIVATE`).
 */
export const upgradePrecon = withActionLogging(
  "deck.upgradePrecon",
  async function upgradePrecon(deckId: string): Promise<{ id: string }> {
    await requireSession();

    const original = await prisma.deck.findUnique({
      where: { id: deckId },
      select: {
        name: true,
        externalSource: true,
        visibility: true,
      },
    });

    if (!original) {
      throw new Error("Deck not found");
    }

    if (
      original.externalSource !== "mtgjson" ||
      original.visibility !== Visibility.PUBLIC
    ) {
      throw new Error("Deck is not an upgradable precon");
    }

    const { id: newDeckId } = await duplicateDeck(deckId);

    const upgradeName = `${original.name} upgrade`;
    await prisma.deck.update({
      where: { id: newDeckId },
      data: { name: upgradeName },
    });

    invalidateTags(deckMetaMutationTagsAll({ deckId: newDeckId }));

    return { id: newDeckId };
  },
);
