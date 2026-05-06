import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { IMAGE_PRINTING_FRAGMENT } from "@/lib/card/image";
import {
  userPublicDecksTag,
  userTag,
} from "@/lib/deck/cache-tags";

/**
 * The page-size used by the public profile route. Exported so the page and
 * tests stay in sync.
 */
export const PROFILE_DECKS_PAGE_SIZE = 24;

export interface PublicProfile {
  id: string;
  username: string;
}

/**
 * Lookup a user by their canonical (lowercased) `username`. Returns `null`
 * when no user exists. The route handler is responsible for converting that
 * into a 404 — this stays a pure read so it can be cached.
 */
export async function getPublicProfile(
  username: string,
): Promise<PublicProfile | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(userTag(username));

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  return user;
}

export interface ProfileDeckPreviewCard {
  zone: import("@/lib/generated/prisma/enums").Zone;
  quantity: number;
  printing: { imageUri: string | null } | null;
  card: { name: string; printings: Array<{ imageUri: string | null }> };
}

export interface ProfileDeck {
  id: string;
  name: string;
  format: import("@/lib/generated/prisma/enums").Format;
  visibility: import("@/lib/generated/prisma/enums").Visibility;
  updatedAt: Date;
  cardCount: number;
  cards: ProfileDeckPreviewCard[];
}

interface ProfileDecksPage {
  decks: ProfileDeck[];
  total: number;
}

async function getDeckCardCounts(
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

async function getDecksByVisibility(
  userId: string,
  visibility: import("@/lib/generated/prisma/enums").Visibility,
  page: number,
): Promise<ProfileDecksPage> {
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * PROFILE_DECKS_PAGE_SIZE;

  const [decks, total] = (await Promise.all([
    prisma.deck.findMany({
      where: { userId, visibility },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: PROFILE_DECKS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        format: true,
        visibility: true,
        updatedAt: true,
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
    }),
    prisma.deck.count({ where: { userId, visibility } }),
  ])) as [Omit<ProfileDeck, "cardCount">[], number];

  const counts = await getDeckCardCounts(decks.map((d) => d.id));
  return {
    decks: decks.map((d) => ({ ...d, cardCount: counts.get(d.id) ?? 0 })),
    total,
  };
}

/**
 * Page of a user's PUBLIC decks (with cover preview). Page is 1-indexed; the
 * implementation clamps to 1 if a smaller value sneaks through.
 */
export async function getUserPublicDecks(
  userId: string,
  page: number,
): Promise<ProfileDecksPage> {
  "use cache";
  cacheLife("minutes");
  cacheTag(userPublicDecksTag(userId));

  return getDecksByVisibility(userId, "PUBLIC", page);
}

/**
 * Page of a user's UNLISTED decks. Owner-only — callers must have already
 * verified the visitor is the profile owner before invoking this. Cached
 * under the same per-user tag so a visibility flip refreshes both lists.
 */
export async function getUserUnlistedDecks(
  userId: string,
  page: number,
): Promise<ProfileDecksPage> {
  "use cache";
  cacheLife("minutes");
  cacheTag(userPublicDecksTag(userId));

  return getDecksByVisibility(userId, "UNLISTED", page);
}
