import { cacheLife } from "next/cache";
import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getOrSet } from "@/lib/cache";
import type { Printing, Prisma } from "@/lib/generated/prisma/client";

const DECK_LIST_TTL_SECONDS = 300; // 5m — invalidated on every deck mutation
const PUBLIC_DECK_TTL_SECONDS = 120; // 2m — high-traffic, slight staleness OK

// Prisma Decimal is not a plain object — it can't cross the Server→Client
// Components boundary. Convert price columns to number at the query boundary
// so the deck can be passed freely to client components.
export type SerializedPrinting = Omit<
  Printing,
  | "priceUsd"
  | "priceUsdFoil"
  | "priceUsdEtched"
  | "priceEur"
  | "priceEurFoil"
  | "priceEurEtched"
> & {
  priceUsd: number | null;
  priceUsdFoil: number | null;
  priceUsdEtched: number | null;
  priceEur: number | null;
  priceEurFoil: number | null;
  priceEurEtched: number | null;
};

function serializePrinting(printing: Printing): SerializedPrinting {
  return {
    ...printing,
    priceUsd: printing.priceUsd ? Number(printing.priceUsd) : null,
    priceUsdFoil: printing.priceUsdFoil ? Number(printing.priceUsdFoil) : null,
    priceUsdEtched: printing.priceUsdEtched
      ? Number(printing.priceUsdEtched)
      : null,
    priceEur: printing.priceEur ? Number(printing.priceEur) : null,
    priceEurFoil: printing.priceEurFoil ? Number(printing.priceEurFoil) : null,
    priceEurEtched: printing.priceEurEtched
      ? Number(printing.priceEurEtched)
      : null,
  };
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

  return getOrSet(`decks:user:${userId}:minimal`, DECK_LIST_TTL_SECONDS, () =>
    prisma.deck.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        format: true,
        updatedAt: true,
      },
    }),
  );
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
  const heroImage =
    hero?.printing?.imageUri ?? hero?.card.printings[0]?.imageUri ?? null;
  return { colors: sortColorsWubrg(identity), heroImage };
}

const STRIP_CARD_SELECT = {
  zone: true,
  printing: { select: { imageUri: true } },
  card: {
    select: {
      colorIdentity: true,
      printings: {
        take: 1,
        orderBy: { id: "asc" },
        select: { imageUri: true },
      },
    },
  },
} as const;

export async function getDecksByUser(userId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("deck-list");

  return getOrSet(`decks:user:${userId}:strip`, DECK_LIST_TTL_SECONDS, async () => {
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

  return getOrSet(
    `decks:user:${userId}:preview`,
    DECK_LIST_TTL_SECONDS,
    () => loadDecksByUserWithPreview(userId),
  );
}

async function loadDecksByUserWithPreview(
  userId: string,
): Promise<DeckWithPreview[]> {
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
              printings: {
                take: 1,
                orderBy: { id: "asc" },
                select: { imageUri: true },
              },
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
    c.printing?.imageUri ?? c.card.printings[0]?.imageUri ?? null;

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

  const cacheKey = `decks:public:p${page}:s${pageSize}:q${q ?? ""}:f${format ?? ""}:c${colors?.join("") ?? ""}:cmd${commander ?? ""}`;

  return getOrSet(cacheKey, PUBLIC_DECK_TTL_SECONDS, () =>
    loadPublicDecksWithPreview({ page, pageSize, q, format, colors, commander }),
  );
}

async function loadPublicDecksWithPreview({
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
                printings: {
                  take: 1,
                  orderBy: { id: "asc" },
                  select: { imageUri: true },
                },
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
}

export async function getDeckById(id: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`deck:${id}`);

  const deck = await prisma.deck.findUnique({
    where: { id },
    include: {
      cards: {
        include: {
          card: {
            include: {
              printings: {
                take: 1,
                orderBy: { id: "asc" },
                select: { imageUri: true },
              },
            },
          },
          printing: true,
        },
      },
      categories: {
        orderBy: { sortOrder: "asc" },
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
      printing: dc.printing ? serializePrinting(dc.printing) : null,
    })),
  };
}
