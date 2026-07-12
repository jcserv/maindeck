"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { Visibility } from "@/lib/generated/prisma/client";
import {
  deckMetaMutationTagsAll,
  forkLineageTag,
  invalidateTags,
} from "@/lib/deck/cache-tags";
import { getForkAncestorIds } from "@/lib/deck/fork-queries";
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
            isFoil: true,
            printingId: true,
            categoryLinks: {
              select: {
                position: true,
                deckCategory: { select: { name: true } },
              },
            },
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
        // Memberships point at the copy's own DeckCategory rows, so map the
        // original's category names onto the freshly created registry.
        const newCategories = await tx.deckCategory.findMany({
          where: { deckId: deck.id },
          select: { id: true, name: true },
        });
        const categoryIdByName = new Map(
          newCategories.map((c) => [c.name, c.id]),
        );

        for (const c of original.cards) {
          await tx.deckCard.create({
            data: {
              deckId: deck.id,
              cardId: c.cardId,
              quantity: c.quantity,
              zone: c.zone,
              isFoil: c.isFoil,
              printingId: c.printingId,
              categoryLinks: {
                create: c.categoryLinks.flatMap((link) => {
                  const deckCategoryId = categoryIdByName.get(
                    link.deckCategory.name,
                  );
                  return deckCategoryId === undefined
                    ? []
                    : [{ deckCategoryId, position: link.position }];
                }),
              },
            },
          });
        }
      }

      return deck;
    });

    invalidateTags(deckMetaMutationTagsAll({ deckId: newDeck.id }));

    // Bump fork-lineage tags on the source deck and each transitive ancestor
    // (cap depth 5) so any "Forks (N)" rails on those ancestors invalidate.
    const ancestorIds = [deckId, ...(await getForkAncestorIds(deckId, 5))];
    invalidateTags(ancestorIds.map((id) => forkLineageTag(id)));

    return { id: newDeck.id };
  },
);
