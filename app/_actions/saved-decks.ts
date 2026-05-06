"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { withActionLogging } from "@/lib/telemetry";
import { Visibility } from "@/lib/generated/prisma/enums";
import { invalidateTags, savedDecksTag } from "@/lib/deck/cache-tags";

/**
 * Save a Deck into the visitor's private bookmarks list.
 *
 * Idempotent: the SavedDeck composite PK `[userId, deckId]` collapses repeated
 * saves into a no-op (`skipDuplicates`). Rejects PRIVATE decks the visitor
 * does not own — those are 404s elsewhere in the app and must not become
 * discoverable via the saved list.
 */
export const saveDeck = withActionLogging(
  "deck.save",
  async (deckId: string): Promise<void> => {
    const session = await requireSession();

    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      select: { userId: true, visibility: true },
    });
    if (!deck) {
      throw new Error("Deck not found");
    }
    const isOwner = deck.userId === session.userId;
    if (deck.visibility === Visibility.PRIVATE && !isOwner) {
      throw new Error("Not authorized to save this deck");
    }

    await prisma.savedDeck.createMany({
      data: [{ userId: session.userId, deckId }],
      skipDuplicates: true,
    });

    invalidateTags([savedDecksTag(session.userId)]);
  },
);

/**
 * Remove a Deck from the visitor's saved list. No-op when the deck wasn't
 * saved — Prisma's `deleteMany` simply matches zero rows.
 */
export const unsaveDeck = withActionLogging(
  "deck.unsave",
  async (deckId: string): Promise<void> => {
    const session = await requireSession();

    await prisma.savedDeck.deleteMany({
      where: { userId: session.userId, deckId },
    });

    invalidateTags([savedDecksTag(session.userId)]);
  },
);
