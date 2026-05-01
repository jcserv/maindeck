import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    deckCard: {
      groupBy: vi.fn(),
    },
  },
}));

import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import {
  getDeckById,
  getDecksByUser,
  getDecksByUserMinimal,
  getDecksByUserWithPreview,
  getPublicDecksWithPreview,
  getRecentPublicDecksForStrip,
  selectDeckPreviewImages,
  type DeckPreviewCard,
} from "../queries";

const mockFindMany = vi.mocked(prisma.deck.findMany);
const mockFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCount = vi.mocked(prisma.deck.count);
const mockGroupBy = vi.mocked(prisma.deckCard.groupBy);
const mockCacheTag = vi.mocked(cacheTag);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockGroupBy.mockResolvedValue([] as never);
});

describe("getDecksByUserMinimal", () => {
  it("scopes findMany to id/name/format/updatedAt and tags the deck-list cache", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "deck-1",
        name: "Burn",
        format: "MODERN",
        updatedAt: new Date("2026-01-01"),
      },
    ] as never);

    const result = await getDecksByUserMinimal(USER_ID);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        format: true,
        updatedAt: true,
      },
    });
    expect(mockCacheTag).toHaveBeenCalledWith("deck-list");
    expect(result).toHaveLength(1);
  });
});

describe("getDecksByUser", () => {
  it("scopes findMany by userId and tags the deck-list cache", async () => {
    mockFindMany.mockResolvedValue([] as never);

    await getDecksByUser(USER_ID);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        orderBy: { updatedAt: "desc" },
      }),
    );
    expect(mockCacheTag).toHaveBeenCalledWith("deck-list");
  });

  it("derives colors in WUBRG order, hero image, and card count from the loaded cards", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: DECK_ID,
        name: "Deck",
        cards: [
          {
            zone: "COMMANDER",
            printing: { imageUri: "commander.jpg" },
            card: {
              colorIdentity: ["G", "W"],
              printings: [{ imageUri: "commander-fallback.jpg" }],
            },
          },
          {
            zone: "MAINBOARD",
            printing: null,
            card: {
              colorIdentity: ["U", "R"],
              printings: [{ imageUri: "blue-red.jpg" }],
            },
          },
          {
            zone: "MAINBOARD",
            printing: { imageUri: "something.jpg" },
            card: {
              colorIdentity: ["W"],
              printings: [],
            },
          },
        ],
      },
    ] as never);
    mockGroupBy.mockResolvedValue([
      { deckId: DECK_ID, _sum: { quantity: 42 } },
    ] as never);

    const result = await getDecksByUser(USER_ID);

    expect(result).toHaveLength(1);
    const deck = result[0]!;
    expect(deck.colors).toEqual(["W", "U", "R", "G"]);
    expect(deck.heroImage).toBe("commander.jpg");
    expect(deck.cardCount).toBe(42);
  });

  it("falls back through the hero chain and defaults counts/colors for edge cases", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "deck-no-commander",
        name: "No commander",
        cards: [
          {
            zone: "MAINBOARD",
            printing: null,
            card: {
              colorIdentity: ["X", "Y"],
              printings: [{ imageUri: "fallback.jpg" }],
            },
          },
        ],
      },
      {
        id: "deck-empty",
        name: "Empty",
        cards: [],
      },
    ] as never);
    // First deck has a null _sum.quantity (hits `?? 0` on line 54);
    // second deck is absent from the result (hits `?? 0` on the deck mapping).
    mockGroupBy.mockResolvedValue([
      { deckId: "deck-no-commander", _sum: { quantity: null } },
    ] as never);

    const result = await getDecksByUser(USER_ID);

    expect(result).toHaveLength(2);
    const [first, second] = result;
    expect(first!.cardCount).toBe(0);
    // colorIdentity "X"/"Y" aren't in WUBRG — forces the `?? 99` fallback on
    // both sides of the sort comparator.
    expect(first!.colors).toEqual(["X", "Y"]);
    // No COMMANDER card → falls back to cards[0]; its printing is null → falls
    // back to card.printings[0].imageUri.
    expect(first!.heroImage).toBe("fallback.jpg");

    // Empty cards → find() and cards[0] are both undefined → heroImage = null.
    expect(second!.cardCount).toBe(0);
    expect(second!.heroImage).toBeNull();
    expect(second!.colors).toEqual([]);
  });
});

describe("getDecksByUserWithPreview", () => {
  it("tags the per-user deck-list cache and selects mainboard/commander non-land cards", async () => {
    mockFindMany.mockResolvedValue([] as never);

    await getDecksByUserWithPreview(USER_ID);

    expect(mockCacheTag).toHaveBeenCalledWith(`decks:user:${USER_ID}`);
    const arg = mockFindMany.mock.calls[0]?.[0];
    expect(arg).toEqual(
      expect.objectContaining({
        where: { userId: USER_ID },
      }),
    );
    expect(arg).toMatchObject({
      select: {
        cards: {
          where: {
            zone: { in: ["MAINBOARD", "COMMANDER"] },
            card: { mainType: { not: "Land" } },
          },
          orderBy: { quantity: "desc" },
        },
      },
    });
  });

  it("attaches cardCount from the groupBy result and defaults to 0 when missing", async () => {
    mockFindMany.mockResolvedValue([
      { id: "deck-a", name: "A", cards: [] },
      { id: "deck-b", name: "B", cards: [] },
    ] as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "deck-a", _sum: { quantity: 12 } },
    ] as never);

    const result = await getDecksByUserWithPreview(USER_ID);

    expect(result).toHaveLength(2);
    expect(result[0]!.cardCount).toBe(12);
    expect(result[1]!.cardCount).toBe(0);
  });
});

describe("getPublicDecksWithPreview", () => {
  it("tags the public cache, paginates from page 1 (skip = 0), and returns total from count", async () => {
    mockFindMany.mockResolvedValue([
      { id: "pub-a", name: "Public A", cards: [] },
      { id: "pub-b", name: "Public B", cards: [] },
    ] as never);
    mockCount.mockResolvedValue(7 as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "pub-a", _sum: { quantity: 5 } },
    ] as never);

    const result = await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(mockCacheTag).toHaveBeenCalledWith("decks:public");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: "PUBLIC" },
        skip: 0,
        take: 10,
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({ where: { visibility: "PUBLIC" } });
    expect(result.total).toBe(7);
    expect(result.decks).toHaveLength(2);
    // pub-a has a count, pub-b is missing from groupBy → default 0 fallback.
    expect(result.decks[0]!.cardCount).toBe(5);
    expect(result.decks[1]!.cardCount).toBe(0);
  });

  it("computes skip via Math.max(1, page) * pageSize for later pages", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 3, pageSize: 12 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 24, take: 12 }),
    );
  });

  it("forwards q/format/colors/commander filters into the where clause", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({
      page: 1,
      pageSize: 10,
      q: "burn",
      format: "COMMANDER",
      colors: ["U", "R"],
      commander: "Krenko",
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          visibility: "PUBLIC",
          name: { contains: "burn", mode: "insensitive" },
          format: "COMMANDER",
          cards: {
            none: { card: { colorIdentity: { hasSome: ["W", "B", "G"] } } },
            some: {
              zone: "COMMANDER",
              card: { name: { contains: "Krenko", mode: "insensitive" } },
            },
          },
        },
      }),
    );
  });
});

describe("getRecentPublicDecksForStrip", () => {
  const DECK_COMMANDER = "strip-commander";
  const DECK_NO_COMMANDER = "strip-no-commander";
  const DECK_EMPTY = "strip-empty";

  it("tags the public cache and returns DeckStripItem shape with hero/colors/count", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: DECK_COMMANDER,
        name: "Commander Deck",
        format: "COMMANDER",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-01"),
        cards: [
          {
            zone: "COMMANDER",
            printing: { imageUri: "commander-hero.jpg" },
            card: {
              colorIdentity: ["G", "W"],
              printings: [{ imageUri: "fallback.jpg" }],
            },
          },
          {
            zone: "MAINBOARD",
            printing: null,
            card: {
              colorIdentity: ["U"],
              printings: [{ imageUri: "blue.jpg" }],
            },
          },
        ],
      },
      {
        id: DECK_NO_COMMANDER,
        name: "No Commander",
        format: "MODERN",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-02"),
        cards: [
          {
            zone: "MAINBOARD",
            printing: null,
            card: {
              colorIdentity: ["R"],
              printings: [{ imageUri: "first-mainboard.jpg" }],
            },
          },
        ],
      },
      {
        id: DECK_EMPTY,
        name: "Empty",
        format: "STANDARD",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-03"),
        cards: [],
      },
    ] as never);
    mockGroupBy.mockResolvedValue([
      { deckId: DECK_COMMANDER, _sum: { quantity: 99 } },
    ] as never);

    const result = await getRecentPublicDecksForStrip(10);

    expect(mockCacheTag).toHaveBeenCalledWith("decks:public");
    expect(result).toHaveLength(3);

    const [commander, noCommander, empty] = result;
    expect(commander!.colors).toEqual(["W", "U", "G"]);
    expect(commander!.heroImage).toBe("commander-hero.jpg");
    expect(commander!.cardCount).toBe(99);

    // No COMMANDER card → falls back to cards[0]; printing null → card.printings[0].
    expect(noCommander!.heroImage).toBe("first-mainboard.jpg");
    expect(noCommander!.cardCount).toBe(0);

    // Empty cards → hero null and empty colors.
    expect(empty!.heroImage).toBeNull();
    expect(empty!.colors).toEqual([]);
    expect(empty!.cardCount).toBe(0);
  });

  it("returns an empty list when the database is unreachable", async () => {
    mockFindMany.mockRejectedValue(new Error("db unreachable"));

    const result = await getRecentPublicDecksForStrip(10);

    expect(result).toEqual([]);
  });
});

describe("selectDeckPreviewImages", () => {
  const makeCard = (
    zone: DeckPreviewCard["zone"],
    quantity: number,
    printingUri: string | null,
    fallbackUri: string | null = null,
  ): DeckPreviewCard => ({
    zone,
    quantity,
    printing: printingUri ? { imageUri: printingUri } : null,
    card: { printings: fallbackUri ? [{ imageUri: fallbackUri }] : [] },
  });

  it("puts the commander first for commander decks, then mainboard cards", () => {
    const cards = [
      makeCard("MAINBOARD", 1, "sol-ring.jpg"),
      makeCard("COMMANDER", 1, "baba.jpg"),
      makeCard("MAINBOARD", 1, "lightning-greaves.jpg"),
    ];

    expect(selectDeckPreviewImages("COMMANDER", cards)).toEqual([
      "baba.jpg",
      "sol-ring.jpg",
      "lightning-greaves.jpg",
    ]);
  });

  it("preserves quantity-desc order for non-singleton formats", () => {
    // DB returns ordered by quantity desc — helper must preserve that order.
    const cards = [
      makeCard("MAINBOARD", 4, "shock.jpg"),
      makeCard("MAINBOARD", 4, "bolt.jpg"),
      makeCard("MAINBOARD", 2, "slickshot.jpg"),
      makeCard("MAINBOARD", 1, "finale.jpg"),
    ];

    expect(selectDeckPreviewImages("STANDARD", cards)).toEqual([
      "shock.jpg",
      "bolt.jpg",
      "slickshot.jpg",
    ]);
  });

  it("falls back to the card's default printing image when deck card has no printing", () => {
    const cards = [
      makeCard("MAINBOARD", 1, null, "fallback.jpg"),
      makeCard("MAINBOARD", 1, "chosen.jpg", "other.jpg"),
    ];

    expect(selectDeckPreviewImages("STANDARD", cards)).toEqual([
      "fallback.jpg",
      "chosen.jpg",
    ]);
  });

  it("skips cards without any image available", () => {
    const cards = [
      makeCard("MAINBOARD", 1, null, null),
      makeCard("MAINBOARD", 1, "has-image.jpg"),
    ];

    expect(selectDeckPreviewImages("MODERN", cards)).toEqual(["has-image.jpg"]);
  });
});

describe("getDeckById", () => {
  it("returns null when the deck does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getDeckById(DECK_ID);

    expect(result).toBeNull();
  });

  it("tags the per-deck cache", async () => {
    mockFindUnique.mockResolvedValue(null);

    await getDeckById(DECK_ID);

    expect(mockCacheTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("serializes Decimal-like printing prices to plain numbers", async () => {
    // Simulate Prisma's Decimal — any value coercible via Number().
    const decimal = (n: number) => ({
      toString: () => String(n),
      valueOf: () => n,
    });

    mockFindUnique.mockResolvedValue({
      id: DECK_ID,
      cards: [
        {
          id: "dc-1",
          printing: {
            priceUsd: decimal(1.5),
            priceUsdFoil: decimal(3.25),
            priceEur: decimal(1.1),
            priceEurFoil: null,
          },
        },
        {
          id: "dc-2",
          printing: null,
        },
      ],
    } as never);

    const result = await getDeckById(DECK_ID);

    expect(result).not.toBeNull();
    const printing = result!.cards[0]!.printing!;
    expect(typeof printing.priceUsd).toBe("number");
    expect(printing.priceUsd).toBe(1.5);
    expect(printing.priceUsdFoil).toBe(3.25);
    expect(printing.priceEur).toBe(1.1);
    expect(printing.priceEurFoil).toBeNull();

    // Null printings pass through untouched.
    expect(result!.cards[1]!.printing).toBeNull();
  });

  it("converts all non-null price fields when every price is present", async () => {
    const decimal = (n: number) => ({
      toString: () => String(n),
      valueOf: () => n,
    });

    mockFindUnique.mockResolvedValue({
      id: DECK_ID,
      cards: [
        {
          id: "dc-1",
          printing: {
            priceUsd: decimal(1.5),
            priceUsdFoil: decimal(3.25),
            priceEur: decimal(1.1),
            priceEurFoil: decimal(2.2),
          },
        },
        {
          id: "dc-2",
          printing: {
            priceUsd: null,
            priceUsdFoil: null,
            priceEur: null,
            priceEurFoil: null,
          },
        },
      ],
    } as never);

    const result = await getDeckById(DECK_ID);

    expect(result).not.toBeNull();
    const pAll = result!.cards[0]!.printing!;
    expect(pAll.priceUsd).toBe(1.5);
    expect(pAll.priceUsdFoil).toBe(3.25);
    expect(pAll.priceEur).toBe(1.1);
    expect(pAll.priceEurFoil).toBe(2.2);

    const pNone = result!.cards[1]!.printing!;
    expect(pNone.priceUsd).toBeNull();
    expect(pNone.priceUsdFoil).toBeNull();
    expect(pNone.priceEur).toBeNull();
    expect(pNone.priceEurFoil).toBeNull();
  });
});
