import { cacheLife } from "next/cache";
import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getOrSet } from "@/lib/cache";
import type { CardType } from "@/lib/generated/prisma/client";

const CARD_TTL_SECONDS = 604_800; // 7d — cards are immutable post-ingest

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardDetail = {
  id: number;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
  mainType: CardType;
  colors: string[];
  cmc: number | null;
  collectorNumber: string | null;
  setCode: string | null;
  setName: string | null;
  imageUri: string | null;
  gameChanger: boolean;
  // EDHREC rank is not yet in the DB schema — displayed as "—" until migrated
  edhrecRank: null;
};

export type DeckContainingCard = {
  id: string;
  name: string;
  format: string | null;
  copies: number;
};

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Look up a card by its name slug.
 * Card data is immutable; cache for weeks.
 */
export async function getCardBySlug(slug: string): Promise<CardDetail | null> {
  "use cache";
  cacheLife("weeks");
  cacheTag(`card:${slug}`);

  return getOrSet(`card:${slug}`, CARD_TTL_SECONDS, async () => {
    const card = await prisma.card.findUnique({
      where: { nameSlug: slug },
      include: {
        printings: {
          take: 1,
          orderBy: { id: "asc" },
          select: {
            imageUri: true,
            collectorNumber: true,
            setCode: true,
            setName: true,
          },
        },
      },
    });

    if (!card) return null;

    const printing = card.printings[0] ?? null;

    return {
      id: card.id,
      name: card.name,
      manaCost: card.manaCost,
      typeLine: card.typeLine,
      oracleText: card.oracleText ?? null,
      mainType: card.mainType,
      colors: card.colors,
      cmc: card.cmc != null ? Number(card.cmc) : null,
      collectorNumber: printing?.collectorNumber ?? null,
      setCode: printing?.setCode ?? null,
      setName: printing?.setName ?? null,
      imageUri: printing?.imageUri ?? null,
      gameChanger: card.gameChanger,
      edhrecRank: null,
    };
  });
}

/**
 * Fetch canonical printing images for a fixed list of card names.
 * Returns a lowercase-name → imageUri map so callers can render in their
 * original order without depending on DB return order.
 * Used by static illustrations (e.g. the landing hero fan) where the name
 * list is known at build time.
 */
export async function getCardImagesByNames(
  names: readonly string[],
): Promise<Record<string, string>> {
  "use cache";
  cacheLife("weeks");
  cacheTag("card-images-by-names");

  if (names.length === 0) return {};

  const cards = await prisma.card.findMany({
    where: { name: { in: [...names] } },
    select: {
      name: true,
      printings: {
        take: 1,
        orderBy: { id: "asc" },
        select: { imageUri: true },
      },
    },
  });

  const map: Record<string, string> = {};
  for (const card of cards) {
    const uri = card.printings[0]?.imageUri;
    if (uri) map[card.name.toLowerCase()] = uri;
  }
  return map;
}

/**
 * Find all decks belonging to a user that contain a specific card.
 * Cached per (userId, cardId) pair; short TTL since deck membership changes.
 */
export async function getDecksContainingCard(
  userId: string,
  cardId: number,
): Promise<DeckContainingCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`decks:user:${userId}`);
  cacheTag(`card-decks:${cardId}`);

  const deckCards = await prisma.deckCard.findMany({
    where: {
      cardId,
      deck: { userId },
    },
    select: {
      quantity: true,
      deck: {
        select: {
          id: true,
          name: true,
          format: true,
        },
      },
    },
  });

  return deckCards.map((dc) => ({
    id: dc.deck.id,
    name: dc.deck.name,
    format: dc.deck.format,
    copies: dc.quantity,
  }));
}
