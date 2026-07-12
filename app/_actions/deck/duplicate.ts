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

        // Bulk-create the rows, then re-select and match copies to originals
        // by identity tuple — createMany can't return ids, and a per-row
        // create loop stalls the 5s interactive transaction on large decks.
        await tx.deckCard.createMany({
          data: original.cards.map((c) => ({
            deckId: deck.id,
            cardId: c.cardId,
            quantity: c.quantity,
            zone: c.zone,
            isFoil: c.isFoil,
            printingId: c.printingId,
          })),
        });
        const copies = await tx.deckCard.findMany({
          where: { deckId: deck.id },
          select: {
            id: true,
            cardId: true,
            zone: true,
            printingId: true,
            isFoil: true,
          },
        });

        const tupleKey = (r: {
          cardId: number;
          zone: string;
          printingId: number | null;
          isFoil: boolean;
        }) => `${r.cardId}|${r.zone}|${r.printingId ?? "-"}|${r.isFoil}`;
        const copyIdsByKey = new Map<string, string[]>();
        for (const r of copies) {
          const key = tupleKey(r);
          const ids = copyIdsByKey.get(key) ?? [];
          ids.push(r.id);
          copyIdsByKey.set(key, ids);
        }

        // Zip same-tuple duplicates in order; the rows are otherwise
        // identical, so any pairing yields the same deck state. Positions are
        // copied verbatim — reads order by position, so gaps are fine.
        const cursor = new Map<string, number>();
        const linkRows: {
          deckCardId: string;
          deckCategoryId: string;
          position: number;
        }[] = [];
        for (const c of original.cards) {
          const key = tupleKey(c);
          const idx = cursor.get(key) ?? 0;
          cursor.set(key, idx + 1);
          const copyId = copyIdsByKey.get(key)?.[idx];
          /* c8 ignore next -- every original row was just copied */
          if (copyId === undefined) continue;
          for (const link of c.categoryLinks) {
            const deckCategoryId = categoryIdByName.get(
              link.deckCategory.name,
            );
            if (deckCategoryId === undefined) continue;
            linkRows.push({ deckCardId: copyId, deckCategoryId, position: link.position });
          }
        }
        if (linkRows.length > 0) {
          await tx.deckCardCategory.createMany({ data: linkRows });
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
