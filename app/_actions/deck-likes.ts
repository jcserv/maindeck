"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { withActionLogging } from "@/lib/telemetry";
import { Visibility } from "@/lib/generated/prisma/enums";
import { deckLikesTag, invalidateTags } from "@/lib/deck/cache-tags";

/**
 * Like a PUBLIC deck. Idempotent — the composite primary key
 * (`userId`, `deckId`) makes a second call a no-op. PRIVATE and UNLISTED
 * decks reject so likes can only originate from a discoverable surface.
 *
 * Self-likes are intentionally allowed: cheaper than a userId equality
 * check and harmless given the count is just a discovery signal.
 *
 * Bumps only `deckLikesTag(deckId)`. We deliberately do NOT bump
 * `publicDecksTag` — every like would otherwise invalidate the entire
 * explore listing for all visitors.
 */
export const likeDeck = withActionLogging(
  "deck.like",
  async (deckId: string): Promise<void> => {
    const session = await requireSession();

    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      select: { visibility: true },
    });

    if (!deck) {
      throw new Error("Deck not found");
    }
    if (deck.visibility !== Visibility.PUBLIC) {
      throw new Error("Only public decks can be liked");
    }

    await prisma.deckLike.upsert({
      where: { userId_deckId: { userId: session.userId, deckId } },
      create: { userId: session.userId, deckId },
      update: {},
    });

    invalidateTags([deckLikesTag(deckId)]);
  },
);

/**
 * Unlike a deck. Idempotent — `deleteMany` matches zero or one row.
 * Like {@link likeDeck}, only PUBLIC decks accept the mutation; UNLISTED
 * and PRIVATE both reject (a deck flipped to UNLISTED keeps any prior
 * likes but the user can't remove them through the UI).
 */
export const unlikeDeck = withActionLogging(
  "deck.unlike",
  async (deckId: string): Promise<void> => {
    const session = await requireSession();

    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      select: { visibility: true },
    });

    if (!deck) {
      throw new Error("Deck not found");
    }
    if (deck.visibility !== Visibility.PUBLIC) {
      throw new Error("Only public decks can be liked");
    }

    await prisma.deckLike.deleteMany({
      where: { userId: session.userId, deckId },
    });

    invalidateTags([deckLikesTag(deckId)]);
  },
);
