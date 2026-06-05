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
  getPublicDecksForSitemap,
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
      where: { userId: USER_ID, kind: "DECK" },
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
        where: { userId: USER_ID, kind: "DECK" },
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
        where: { userId: USER_ID, kind: "DECK" },
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
        where: { visibility: "PUBLIC", kind: "DECK" },
        orderBy: [
          { externalSource: { sort: "asc", nulls: "first" } },
          { updatedAt: "desc" },
          { id: "desc" },
        ],
        skip: 0,
        take: 10,
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: { visibility: "PUBLIC", kind: "DECK" },
    });
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
          kind: "DECK",
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

  it("source=community adds externalSource: null constraint", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10, source: "community" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: "PUBLIC", kind: "DECK", externalSource: null },
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: { visibility: "PUBLIC", kind: "DECK", externalSource: null },
    });
  });

  it("source=official adds externalSource: 'mtgjson' constraint", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10, source: "official" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: "PUBLIC", kind: "DECK", externalSource: "mtgjson" },
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: { visibility: "PUBLIC", kind: "DECK", externalSource: "mtgjson" },
    });
  });

  it("source=all applies no externalSource constraint", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10, source: "all" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: "PUBLIC", kind: "DECK" },
      }),
    );
  });

  it("uses community-first orderBy by default (externalSource nulls first, then updatedAt desc)", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { externalSource: { sort: "asc", nulls: "first" } },
          { updatedAt: "desc" },
          { id: "desc" },
        ],
      }),
    );
  });

  it("sort=updated keeps the community-first prefix (T2 + T5 coordination)", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10, sort: "updated" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { externalSource: { sort: "asc", nulls: "first" } },
          { updatedAt: "desc" },
          { id: "desc" },
        ],
      }),
    );
  });

  it("sort=created orders by createdAt desc with id tiebreaker (no community-first prefix)", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10, sort: "created" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("sort=released orders by releasedAt desc nulls-last with id tiebreaker (no community-first prefix)", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({
      page: 1,
      pageSize: 10,
      sort: "released",
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { releasedAt: { sort: "desc", nulls: "last" } },
          { id: "desc" },
        ],
      }),
    );
  });

  it("sets isOfficial=true for a deck with externalSource 'mtgjson'", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "precon-1",
        name: "Precon Deck",
        cards: [],
        externalSource: "mtgjson",
      },
    ] as never);
    mockCount.mockResolvedValue(1 as never);

    const result = await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(result.decks[0]!.isOfficial).toBe(true);
  });

  it("sets isOfficial=false for a deck with no externalSource (user deck)", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "user-deck-1",
        name: "My Deck",
        cards: [],
        externalSource: null,
      },
    ] as never);
    mockCount.mockResolvedValue(1 as never);

    const result = await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(result.decks[0]!.isOfficial).toBe(false);
  });

  it("populates commanderName from the COMMANDER-zone DeckCard for COMMANDER format", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "cmd-deck",
        name: "My Commander Deck",
        format: "COMMANDER",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-01"),
        releasedAt: null,
        user: { username: "player1", image: null },
        cards: [
          {
            zone: "COMMANDER",
            quantity: 1,
            printing: null,
            card: { name: "Krenko, Mob Boss", printings: [] },
          },
          {
            zone: "MAINBOARD",
            quantity: 4,
            printing: null,
            card: { name: "Goblin Guide", printings: [] },
          },
        ],
      },
    ] as never);
    mockCount.mockResolvedValue(1 as never);

    const result = await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(result.decks[0]!.commanderName).toBe("Krenko, Mob Boss");
  });

  it("sets commanderName to null for non-COMMANDER formats", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "modern-deck",
        name: "Burn",
        format: "MODERN",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-01"),
        releasedAt: null,
        user: { username: "player2", image: null },
        cards: [
          {
            zone: "MAINBOARD",
            quantity: 4,
            printing: null,
            card: { name: "Lightning Bolt", printings: [] },
          },
        ],
      },
    ] as never);
    mockCount.mockResolvedValue(1 as never);

    const result = await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(result.decks[0]!.commanderName).toBeNull();
  });

  it("breaks ties between equal-quantity COMMANDER cards by alphabetical card name", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "partner-deck",
        name: "Partner Deck",
        format: "COMMANDER",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-01"),
        releasedAt: null,
        user: { username: "player4", image: null },
        cards: [
          {
            zone: "COMMANDER",
            quantity: 1,
            printing: null,
            card: { name: "Tymna the Weaver", printings: [] },
          },
          {
            zone: "COMMANDER",
            quantity: 1,
            printing: null,
            card: { name: "Bruse Tarl, Boorish Herder", printings: [] },
          },
        ],
      },
    ] as never);
    mockCount.mockResolvedValue(1 as never);

    const result = await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(result.decks[0]!.commanderName).toBe("Bruse Tarl, Boorish Herder");
  });

  it("sets commanderName to null for COMMANDER decks with no COMMANDER-zone DeckCard", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "cmd-no-commander",
        name: "Incomplete Commander Deck",
        format: "COMMANDER",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-01"),
        releasedAt: null,
        user: { username: "player3", image: null },
        cards: [
          {
            zone: "MAINBOARD",
            quantity: 1,
            printing: null,
            card: { name: "Sol Ring", printings: [] },
          },
        ],
      },
    ] as never);
    mockCount.mockResolvedValue(1 as never);

    const result = await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(result.decks[0]!.commanderName).toBeNull();
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

describe("getPublicDecksForSitemap", () => {
  it("scopes to PUBLIC decks and tags the public-decks cache", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "user-deck",
        updatedAt: new Date("2026-03-01"),
        externalSource: null,
      },
      {
        id: "precon-deck",
        updatedAt: new Date("2026-02-01"),
        externalSource: "mtgjson",
      },
    ] as never);

    const result = await getPublicDecksForSitemap();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { visibility: "PUBLIC", kind: "DECK" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        updatedAt: true,
        externalSource: true,
      },
    });
    expect(mockCacheTag).toHaveBeenCalledWith("decks:public");
    expect(result).toEqual([
      {
        id: "user-deck",
        updatedAt: new Date("2026-03-01"),
        externalSource: null,
      },
      {
        id: "precon-deck",
        updatedAt: new Date("2026-02-01"),
        externalSource: "mtgjson",
      },
    ]);
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
    card: {
      name: "Test Card",
      printings: fallbackUri
        ? [{ imageUri: fallbackUri, backImageUri: null }]
        : [],
    },
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

  it("serializes Decimal-like card.printings prices to plain numbers", async () => {
    const decimal = (n: number) => ({
      toString: () => String(n),
      valueOf: () => n,
    });

    mockFindUnique.mockResolvedValue({
      id: DECK_ID,
      cards: [
        {
          id: "dc-1",
          card: {
            id: 7,
            name: "Lightning Bolt",
            printings: [
              {
                id: 100,
                imageUri: "bolt.jpg",
                backImageUri: null,
                priceUsd: decimal(0.5),
                priceUsdFoil: decimal(2.0),
              },
              {
                id: 101,
                imageUri: "bolt2.jpg",
                backImageUri: null,
                priceUsd: null,
                priceUsdFoil: null,
              },
            ],
          },
          printing: null,
        },
      ],
    } as never);

    const result = await getDeckById(DECK_ID);

    expect(result).not.toBeNull();
    const printings = result!.cards[0]!.card!.printings;
    expect(printings).toHaveLength(2);
    expect(printings[0]!.priceUsd).toBe(0.5);
    expect(printings[0]!.priceUsdFoil).toBe(2.0);
    expect(printings[0]!.imageUri).toBe("bolt.jpg");
    expect(printings[1]!.priceUsd).toBeNull();
    expect(printings[1]!.priceUsdFoil).toBeNull();
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
