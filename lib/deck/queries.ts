import { cacheLife } from "next/cache";
import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { IMAGE_PRINTING_FRAGMENT, resolveCardImage } from "@/lib/card/image";

// Only the printing columns actually consumed by UI and export code.
// Prisma Decimal is not serializable across the Server→Client boundary,
// so price columns are converted to number here.
export type SerializedPrinting = {
  imageUri: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: import("@/lib/generated/prisma/enums").Rarity | null;
  priceUsd: number | null;
  priceUsdFoil: number | null;
  priceEur: number | null;
  priceEurFoil: number | null;
};

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

export type DeckMinimal = {
  id: string;
  name: string;
  format: import("@/lib/generated/prisma/enums").Format;
  updatedAt: Date;
};

export async function getDecksByUserMinimal(
  userId: string,
): Promise<DeckMinimal[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("deck-list");

  return prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      format: true,
      updatedAt: true,
    },
  });
}

const WUBRG_ORDER: Record<string, number> = { W: 0, U: 1, B: 2, R: 3, G: 4 };

function sortColorsWubrg(colors: Iterable<string>): string[] {
  return [...new Set(colors)].sort(
    (a, b) => (WUBRG_ORDER[a] ?? 99) - (WUBRG_ORDER[b] ?? 99),
  );
}

interface StripSourceCard {
  zone: import("@/lib/generated/prisma/enums").Zone;
  printing: { imageUri: string | null } | null;
  card: {
    colorIdentity: string[];
    printings: Array<{ imageUri: string | null }>;
  };
}

function deriveStripExtras(cards: StripSourceCard[]): {
  colors: string[];
  heroImage: string | null;
} {
  const identity = new Set<string>();
  for (const dc of cards) {
    for (const c of dc.card.colorIdentity) identity.add(c);
  }
  const hero = cards.find((c) => c.zone === "COMMANDER") ?? cards[0] ?? null;
  const heroImage = hero
    ? resolveCardImage({ printing: hero.printing, card: hero.card })
    : null;
  return { colors: sortColorsWubrg(identity), heroImage };
}

const STRIP_CARD_SELECT = {
  zone: true,
  printing: { select: { imageUri: true } },
  card: {
    select: {
      colorIdentity: true,
      printings: IMAGE_PRINTING_FRAGMENT,
    },
  },
} as const;

export async function getDecksByUser(userId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("deck-list");

  const decks = await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      cards: {
        where: {
          zone: { in: ["COMMANDER", "MAINBOARD"] },
          card: { mainType: { not: "Land" } },
        },
        orderBy: { quantity: "desc" },
        select: STRIP_CARD_SELECT,
      },
    },
  });

  const counts = await getDeckCardCounts(decks.map((d) => d.id));
  return decks.map(({ cards, ...deck }) => {
    const { colors, heroImage } = deriveStripExtras(cards);
    return {
      ...deck,
      cardCount: counts.get(deck.id) ?? 0,
      colors,
      heroImage,
    };
  });
}

export interface DeckPreviewCard {
  zone: import("@/lib/generated/prisma/enums").Zone;
  quantity: number;
  printing: { imageUri: string | null } | null;
  card: { printings: Array<{ imageUri: string | null }> };
}

export interface DeckWithPreview {
  id: string;
  name: string;
  format: import("@/lib/generated/prisma/enums").Format;
  visibility: import("@/lib/generated/prisma/enums").Visibility;
  updatedAt: Date;
  cardCount: number;
  cards: DeckPreviewCard[];
}

export async function getDecksByUserWithPreview(
  userId: string,
): Promise<DeckWithPreview[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`decks:user:${userId}`);

  const decks = (await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
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
          printing: {
            select: { imageUri: true },
          },
          card: {
            select: {
              printings: IMAGE_PRINTING_FRAGMENT,
            },
          },
        },
      },
    },
  })) as Omit<DeckWithPreview, "cardCount">[];

  const counts = await getDeckCardCounts(decks.map((d) => d.id));
  return decks.map((deck) => ({
    ...deck,
    cardCount: counts.get(deck.id) ?? 0,
  }));
}

/**
 * Pick up to 3 preview images for a deck thumbnail.
 * - Commander format: commander card first, then 2 non-land mainboard cards.
 * - Other formats: cards sorted by quantity descending, excluding lands.
 */
export function selectDeckPreviewImages(
  format: import("@/lib/generated/prisma/enums").Format,
  cards: DeckPreviewCard[],
): string[] {
  const uri = (c: DeckPreviewCard) =>
    resolveCardImage({ printing: c.printing, card: c.card });

  const ordered =
    format === "COMMANDER"
      ? [
          ...cards.filter((c) => c.zone === "COMMANDER"),
          ...cards.filter((c) => c.zone === "MAINBOARD"),
        ]
      : cards.filter((c) => c.zone === "MAINBOARD");

  const images: string[] = [];
  for (const c of ordered) {
    const src = uri(c);
    if (src) images.push(src);
    if (images.length === 3) break;
  }
  return images;
}

export interface PublicDeckWithPreview extends DeckWithPreview {
  user: { username: string; image: string | null };
}

export interface PublicDecksQuery {
  page: number;
  pageSize: number;
  q?: string;
  format?: import("@/lib/generated/prisma/enums").Format;
  colors?: string[];
  commander?: string;
}

const WUBRG = ["W", "U", "B", "R", "G"] as const;

function buildPublicDecksWhere({
  q,
  format,
  colors,
  commander,
}: Omit<PublicDecksQuery, "page" | "pageSize">): Prisma.DeckWhereInput {
  const where: Prisma.DeckWhereInput = { visibility: "PUBLIC" };

  if (q) where.name = { contains: q, mode: "insensitive" };
  if (format) where.format = format;

  const cardsFilter: Prisma.DeckCardListRelationFilter = {};
  if (colors && colors.length > 0 && colors.length < WUBRG.length) {
    const excluded = WUBRG.filter((c) => !colors.includes(c));
    cardsFilter.none = { card: { colorIdentity: { hasSome: excluded } } };
  }
  if (commander && format === "COMMANDER") {
    cardsFilter.some = {
      zone: "COMMANDER",
      card: { name: { contains: commander, mode: "insensitive" } },
    };
  }
  if (Object.keys(cardsFilter).length > 0) where.cards = cardsFilter;

  return where;
}

export async function getPublicDecksWithPreview({
  page,
  pageSize,
  q,
  format,
  colors,
  commander,
}: PublicDecksQuery): Promise<{
  decks: PublicDeckWithPreview[];
  total: number;
}> {
  "use cache";
  cacheLife("minutes");
  cacheTag("decks:public");

  const skip = (Math.max(1, page) - 1) * pageSize;
  const where = buildPublicDecksWhere({ q, format, colors, commander });

  const [decks, total] = (await Promise.all([
    prisma.deck.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
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
                printings: IMAGE_PRINTING_FRAGMENT,
              },
            },
          },
        },
      },
    }),
    prisma.deck.count({ where }),
  ])) as [Omit<PublicDeckWithPreview, "cardCount">[], number];

  const counts = await getDeckCardCounts(decks.map((d) => d.id));
  return {
    decks: decks.map((d) => ({ ...d, cardCount: counts.get(d.id) ?? 0 })),
    total,
  };
}

export interface DeckStripItem {
  id: string;
  name: string;
  format: import("@/lib/generated/prisma/enums").Format;
  visibility: import("@/lib/generated/prisma/enums").Visibility;
  cardCount: number;
  updatedAt: Date;
  colors: string[];
  heroImage: string | null;
}

export async function getRecentPublicDecksForStrip(
  limit: number,
): Promise<DeckStripItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("decks:public");

  // The landing strip prerenders at build time; CI builds may not have a live
  // DB. Fall back to an empty list so the page still ships an empty strip
  // instead of failing the entire prerender.
  try {
    const decks = await prisma.deck.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        cards: {
          where: {
            zone: { in: ["COMMANDER", "MAINBOARD"] },
            card: { mainType: { not: "Land" } },
          },
          orderBy: { quantity: "desc" },
          select: STRIP_CARD_SELECT,
        },
      },
    });

    const counts = await getDeckCardCounts(decks.map((d) => d.id));
    return decks.map(({ cards, ...deck }) => {
      const { colors, heroImage } = deriveStripExtras(cards);
      return {
        id: deck.id,
        name: deck.name,
        format: deck.format,
        visibility: deck.visibility,
        cardCount: counts.get(deck.id) ?? 0,
        updatedAt: deck.updatedAt,
        colors,
        heroImage,
      };
    });
  } catch {
    return [];
  }
}

export async function getDeckById(id: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`deck:${id}`);

  const deck = await prisma.deck.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      format: true,
      visibility: true,
      manualBracket: true,
      cards: {
        select: {
          id: true,
          deckId: true,
          cardId: true,
          quantity: true,
          zone: true,
          category: true,
          printingId: true,
          isFoil: true,
          card: {
            select: {
              id: true,
              name: true,
              mainType: true,
              typeLine: true,
              oracleText: true,
              manaCost: true,
              cmc: true,
              colors: true,
              colorIdentity: true,
              legalities: true,
              gameChanger: true,
              printings: IMAGE_PRINTING_FRAGMENT,
            },
          },
          printing: {
            select: {
              imageUri: true,
              setCode: true,
              setName: true,
              collectorNumber: true,
              rarity: true,
              priceUsd: true,
              priceUsdFoil: true,
              priceEur: true,
              priceEurFoil: true,
            },
          },
        },
      },
      categories: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          deckId: true,
          name: true,
          sortOrder: true,
          createdAt: true,
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          image: true,
        },
      },
    },
  });

  if (!deck) return null;

  return {
    ...deck,
    cards: deck.cards.map((dc) => ({
      ...dc,
      printing: dc.printing
        ? {
            imageUri: dc.printing.imageUri,
            setCode: dc.printing.setCode,
            setName: dc.printing.setName,
            collectorNumber: dc.printing.collectorNumber,
            rarity: dc.printing.rarity,
            priceUsd: dc.printing.priceUsd ? Number(dc.printing.priceUsd) : null,
            priceUsdFoil: dc.printing.priceUsdFoil ? Number(dc.printing.priceUsdFoil) : null,
            priceEur: dc.printing.priceEur ? Number(dc.printing.priceEur) : null,
            priceEurFoil: dc.printing.priceEurFoil ? Number(dc.printing.priceEurFoil) : null,
          }
        : null,
    })),
  };
}
