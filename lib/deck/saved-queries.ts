import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { IMAGE_PRINTING_FRAGMENT } from "@/lib/card/image";
import { savedDecksTag } from "@/lib/deck/cache-tags";
import type { Format, Visibility } from "@/lib/generated/prisma/enums";
import { type DeckPreviewCard } from "@/lib/deck/queries";

/**
 * One row in `/saved`. When the underlying Deck has flipped to PRIVATE *and*
 * the saving user no longer owns it, `deck` is null — the row stays so the
 * user can unsave it and so we don't lie about counts. Render that row as
 * "No longer available".
 */
interface SavedDeckListItem {
  deckId: string;
  savedAt: Date;
  /** Null when the deck flipped to PRIVATE and we're no longer the owner. */
  deck: {
    id: string;
    name: string;
    format: Format;
    visibility: Visibility;
    updatedAt: Date;
    cardCount: number;
    cards: DeckPreviewCard[];
    user: { username: string; image: string | null };
  } | null;
}

interface SavedDecksPage {
  items: SavedDeckListItem[];
  total: number;
}

/**
 * List the decks a user has saved, newest first, paginated. Items where the
 * underlying deck is now PRIVATE-and-not-owned-by-the-viewer are returned
 * with `deck: null` so the UI can render a "No longer available" placeholder
 * without leaking the deck contents.
 */
export async function getSavedDecksForUser(input: {
  userId: string;
  page: number;
  pageSize: number;
}): Promise<SavedDecksPage> {
  "use cache";
  cacheLife("minutes");
  cacheTag(savedDecksTag(input.userId));

  const skip = (Math.max(1, input.page) - 1) * input.pageSize;

  const [rows, total] = await Promise.all([
    prisma.savedDeck.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: input.pageSize,
      select: {
        deckId: true,
        createdAt: true,
        deck: {
          select: {
            id: true,
            userId: true,
            name: true,
            format: true,
            visibility: true,
            updatedAt: true,
            user: { select: { username: true, image: true } },
            cards: {
              where: {
                zone: { in: ["MAINBOARD", "COMMANDER"] },
                card: { mainType: { not: "Land" } },
              },
              orderBy: { quantity: "desc" },
              select: {
                zone: true,
                quantity: true,
                printing: { select: { imageUri: true } },
                card: {
                  select: {
                    name: true,
                    printings: IMAGE_PRINTING_FRAGMENT,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.savedDeck.count({ where: { userId: input.userId } }),
  ]);

  const visibleDeckIds = rows
    .filter(
      (r) =>
        r.deck &&
        (r.deck.visibility !== "PRIVATE" || r.deck.userId === input.userId),
    )
    .map((r) => r.deck!.id);

  const counts = await getSavedDeckCardCounts(visibleDeckIds);

  const items: SavedDeckListItem[] = rows.map((r) => {
    if (!r.deck) {
      return { deckId: r.deckId, savedAt: r.createdAt, deck: null };
    }
    const isOwner = r.deck.userId === input.userId;
    if (r.deck.visibility === "PRIVATE" && !isOwner) {
      return { deckId: r.deckId, savedAt: r.createdAt, deck: null };
    }
    return {
      deckId: r.deckId,
      savedAt: r.createdAt,
      deck: {
        id: r.deck.id,
        name: r.deck.name,
        format: r.deck.format,
        visibility: r.deck.visibility,
        updatedAt: r.deck.updatedAt,
        cardCount: counts.get(r.deck.id) ?? 0,
        cards: r.deck.cards as DeckPreviewCard[],
        user: r.deck.user,
      },
    };
  });

  return { items, total };
}

async function getSavedDeckCardCounts(
  deckIds: string[],
): Promise<Map<string, number>> {
  if (deckIds.length === 0) return new Map();
  const rows = await prisma.deckCard.groupBy({
    by: ["deckId"],
    where: {
      deckId: { in: deckIds },
      zone: { in: ["MAINBOARD", "COMMANDER"] },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.deckId, r._sum.quantity ?? 0]));
}

/**
 * True when the visitor has already saved this deck. Reads through the
 * per-user saved-decks cache so the Save button can render its initial
 * "saved/unsaved" state without an extra round trip.
 */
export async function isDeckSavedByUser(input: {
  userId: string;
  deckId: string;
}): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  cacheTag(savedDecksTag(input.userId));

  const row = await prisma.savedDeck.findUnique({
    where: { userId_deckId: { userId: input.userId, deckId: input.deckId } },
    select: { userId: true },
  });
  return row !== null;
}
