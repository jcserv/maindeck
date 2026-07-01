import { cacheLife } from "next/cache";
import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { IMAGE_PRINTING_FRAGMENT, resolveCardImage } from "@/lib/card/image";
import {
  deckLikesTag,
  deckListTag,
  deckTag,
  publicDecksTag,
  userDecksTag,
} from "@/lib/deck/cache-tags";

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

type DeckMinimal = {
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
  cacheTag(deckListTag());

  return prisma.deck.findMany({
    where: { userId, kind: "DECK" },
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

// The `DeckPreviewCard` shape, shared by the list-query preview projections
// (`getDecksByUserWithPreview` + `getPublicDecksWithPreview`).
const PREVIEW_CARD_SELECT = {
  zone: true,
  quantity: true,
  printing: { select: { imageUri: true } },
  card: {
    select: {
      name: true,
      printings: IMAGE_PRINTING_FRAGMENT,
    },
  },
} as const;

export async function getDecksByUser(userId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(deckListTag());

  const decks = await prisma.deck.findMany({
    where: { userId, kind: "DECK" },
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
  card: {
    name: string;
    printings: Array<{ imageUri: string | null; backImageUri: string | null }>;
  };
}

interface DeckWithPreview {
  id: string;
  name: string;
  format: import("@/lib/generated/prisma/enums").Format;
  visibility: import("@/lib/generated/prisma/enums").Visibility;
  createdAt: Date;
  updatedAt: Date;
  releasedAt: Date | null;
  cardCount: number;
  cards: DeckPreviewCard[];
}

export async function getDecksByUserWithPreview(
  userId: string,
): Promise<DeckWithPreview[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(userDecksTag(userId));

  const decks = (await prisma.deck.findMany({
    where: { userId, kind: "DECK" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      format: true,
      visibility: true,
      updatedAt: true,
      releasedAt: true,
      cards: {
        where: {
          zone: { in: ["MAINBOARD", "COMMANDER"] },
          card: { mainType: { not: "Land" } },
        },
        orderBy: { quantity: "desc" },
        select: PREVIEW_CARD_SELECT,
      },
    },
  })) as unknown as Omit<DeckWithPreview, "cardCount">[];

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

/**
 * The commander's card name for a Commander deck — the highest-quantity card in
 * the COMMANDER zone, name-tiebroken. Null for non-Commander decks or when the
 * deck has no commander.
 */
function selectCommanderName(
  format: import("@/lib/generated/prisma/enums").Format,
  cards: DeckPreviewCard[],
): string | null {
  if (format !== "COMMANDER") return null;
  const commanderCard = [...cards]
    .filter((c) => c.zone === "COMMANDER")
    .sort(
      (a, b) =>
        b.quantity - a.quantity || a.card.name.localeCompare(b.card.name),
    )[0];
  return commanderCard?.card.name ?? null;
}

export interface PublicDeckWithPreview extends DeckWithPreview {
  user: { username: string; image: string | null };
  /** True when the deck was ingested from mtgjson (i.e. a WotC precon). */
  isOfficial: boolean;
  commanderName: string | null;
  likeCount: number;
}

interface PublicDecksQuery {
  page: number;
  pageSize: number;
  q?: string;
  format?: import("@/lib/generated/prisma/enums").Format;
  colors?: string[];
  commander?: string;
  /** "community" = user decks (externalSource null), "official" = precons (externalSource "mtgjson"), "all" = no filter */
  source?: "all" | "community" | "official";
  sort?: "updated" | "created" | "released";
}

const WUBRG = ["W", "U", "B", "R", "G"] as const;

function buildPublicDecksWhere({
  q,
  format,
  colors,
  commander,
  source,
}: Omit<PublicDecksQuery, "page" | "pageSize">): Prisma.DeckWhereInput {
  const where: Prisma.DeckWhereInput = { visibility: "PUBLIC", kind: "DECK" };

  if (q) where.name = { contains: q, mode: "insensitive" };
  if (format) where.format = format;

  if (source === "community") {
    where.externalSource = null;
  } else if (source === "official") {
    where.externalSource = "mtgjson";
  }

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

function buildPublicDecksOrderBy(
  sort: "updated" | "created" | "released" | undefined,
): Prisma.DeckOrderByWithRelationInput[] {
  // Explicit sort axes (T5) take precedence and do NOT apply T2's community-first prefix.
  if (sort === "created") return [{ createdAt: "desc" }, { id: "desc" }];
  if (sort === "released")
    return [{ releasedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];
  // Default ("updated") — T2's community-first ordering: user decks (externalSource null)
  // before precons ("mtgjson"), then by updatedAt desc, then id desc as a stable tiebreaker.
  return [
    { externalSource: { sort: "asc", nulls: "first" } },
    { updatedAt: "desc" },
    { id: "desc" },
  ];
}

export async function getPublicDecksWithPreview({
  page,
  pageSize,
  q,
  format,
  colors,
  commander,
  source,
  sort,
}: PublicDecksQuery): Promise<{
  decks: PublicDeckWithPreview[];
  total: number;
}> {
  "use cache";
  cacheLife("minutes");
  cacheTag(publicDecksTag());

  const skip = (Math.max(1, page) - 1) * pageSize;
  const where = buildPublicDecksWhere({
    ...(q !== undefined && { q }),
    ...(format !== undefined && { format }),
    ...(colors !== undefined && { colors }),
    ...(commander !== undefined && { commander }),
    ...(source !== undefined && { source }),
  });

  const [decks, total] = (await Promise.all([
    prisma.deck.findMany({
      where,
      orderBy: buildPublicDecksOrderBy(sort),
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        format: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        releasedAt: true,
        externalSource: true,
        _count: { select: { likes: true } },
        user: { select: { username: true, image: true } },
        cards: {
          where: {
            zone: { in: ["MAINBOARD", "COMMANDER"] },
            card: { mainType: { not: "Land" } },
          },
          orderBy: { quantity: "desc" },
          select: PREVIEW_CARD_SELECT,
        },
      },
    }),
    prisma.deck.count({ where }),
  ])) as [
    (Omit<
      PublicDeckWithPreview,
      "cardCount" | "isOfficial" | "commanderName" | "likeCount"
    > & {
      externalSource: string | null;
      _count?: { likes: number } | null;
    })[],
    number,
  ];

  // Tag each deck's like count so like/unlike on any visible deck invalidates
  // this list. Bumping `decks:public` would re-render explore on every like,
  // which is why we route invalidation through per-deck tags instead.
  for (const d of decks) {
    cacheTag(deckLikesTag(d.id));
  }

  const counts = await getDeckCardCounts(decks.map((d) => d.id));
  return {
    decks: decks.map(({ externalSource, _count, ...d }) => ({
      ...d,
      cardCount: counts.get(d.id) ?? 0,
      likeCount: _count?.likes ?? 0,
      isOfficial: externalSource === "mtgjson",
      commanderName: selectCommanderName(d.format, d.cards),
    })),
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
  releasedAt: Date | null;
  colors: string[];
  heroImage: string | null;
}

export async function getRecentPublicDecksForStrip(
  limit: number,
): Promise<DeckStripItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(publicDecksTag());

  // The landing strip prerenders at build time; CI builds may not have a live
  // DB. Fall back to an empty list so the page still ships an empty strip
  // instead of failing the entire prerender.
  try {
    const decks = await prisma.deck.findMany({
      where: { visibility: "PUBLIC", kind: "DECK" },
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
        releasedAt: deck.releasedAt,
        colors,
        heroImage,
      };
    });
  } catch {
    return [];
  }
}

interface PublicDeckSitemapEntry {
  id: string;
  updatedAt: Date;
  externalSource: string | null;
}

/**
 * Every PUBLIC deck, projected to just what `app/sitemap.ts` needs (id,
 * lastmod, externalSource for the precon vs user-deck priority split).
 *
 * Cached at the `decks:public` tag with `hours` lifetime — the sitemap is
 * pulled by crawlers infrequently and we'd rather not run a full table scan
 * on every fetch.
 */
export async function getPublicDecksForSitemap(): Promise<
  PublicDeckSitemapEntry[]
> {
  "use cache";
  cacheLife("hours");
  cacheTag(publicDecksTag());

  return prisma.deck.findMany({
    where: { visibility: "PUBLIC", kind: "DECK" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      updatedAt: true,
      externalSource: true,
    },
  });
}

/**
 * Whether the given user has liked the given deck.
 *
 * Per-viewer signal — never cached. The deck page calls this alongside
 * the cached `getDeckById` so the like button renders with the right
 * pressed state. Returns false when no userId is provided so callers
 * can pass `session?.userId` without branching.
 */
export async function hasViewerLikedDeck(
  deckId: string,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const row = await prisma.deckLike.findUnique({
    where: { userId_deckId: { userId, deckId } },
    select: { userId: true },
  });
  return row !== null;
}

export async function getDeckById(id: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(deckTag(id));
  cacheTag(deckLikesTag(id));

  const deck = await prisma.deck.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      format: true,
      visibility: true,
      kind: true,
      collaborationEnabled: true,
      manualBracket: true,
      updatedAt: true,
      externalSource: true,
      _count: {
        select: { likes: true },
      },
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
              keywords: true,
              printings: {
                take: 1,
                orderBy: { id: "asc" },
                select: {
                  id: true,
                  imageUri: true,
                  backImageUri: true,
                  priceUsd: true,
                  priceUsdFoil: true,
                },
              },
            },
          },
          printing: {
            select: {
              imageUri: true,
              backImageUri: true,
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

  const { _count, ...rest } = deck;
  return {
    ...rest,
    likeCount: _count?.likes ?? 0,
    cards: deck.cards.map((dc) => ({
      ...dc,
      ...(dc.card
        ? {
            card: {
              ...dc.card,
              printings: dc.card.printings.map((p) => ({
                id: p.id,
                imageUri: p.imageUri,
                backImageUri: p.backImageUri,
                priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
                priceUsdFoil: p.priceUsdFoil ? Number(p.priceUsdFoil) : null,
              })),
            },
          }
        : {}),
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
