"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { Visibility } from "@/lib/generated/prisma/client";
import {
  deckMetaMutationTagsAll,
  invalidateTags,
} from "@/lib/deck/cache-tags";
import { withActionLogging } from "@/lib/telemetry";

export const duplicateDeck = withActionLogging(
  "deck.duplicate",
  async function duplicateDeck(deckId: string): Promise<{ id: string }> {
    const session = await requireSession();

    const original = await prisma.deck.findUnique({
      where: { id: deckId },
      select: {
        userId: true,
        name: true,
        description: true,
        format: true,
        visibility: true,
        cards: {
          select: {
            cardId: true,
            quantity: true,
            zone: true,
            category: true,
            isFoil: true,
            printingId: true,
          },
        },
        categories: {
          select: {
            name: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!original) {
      throw new Error("Deck not found");
    }

    const isOwner = original.userId === session.userId;
    const isForkable =
      original.visibility === Visibility.PUBLIC ||
      original.visibility === Visibility.UNLISTED;

    if (!isOwner && !isForkable) {
      throw new Error("Not authorized to duplicate this deck");
    }

    const newDeck = await prisma.$transaction(async (tx) => {
      const deck = await tx.deck.create({
        data: {
          userId: session.userId,
          name: `${original.name} (Copy)`,
          description: original.description,
          format: original.format,
          visibility: Visibility.PRIVATE,
          forkedFromId: deckId,
          categories: {
            createMany: {
              data: original.categories.map((c) => ({
                name: c.name,
                sortOrder: c.sortOrder,
              })),
            },
          },
        },
        select: { id: true },
      });

      if (original.cards.length > 0) {
        await tx.deckCard.createMany({
          data: original.cards.map((c) => ({
            deckId: deck.id,
            cardId: c.cardId,
            quantity: c.quantity,
            zone: c.zone,
            category: c.category,
            isFoil: c.isFoil,
            printingId: c.printingId,
          })),
        });
      }

      return deck;
    });

    invalidateTags(deckMetaMutationTagsAll({ deckId: newDeck.id }));

    return { id: newDeck.id };
  },
);
