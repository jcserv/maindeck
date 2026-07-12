import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    printing: { findUnique: vi.fn() },
    holding: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    deckCard: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    deckCategory: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    deck: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/deck/wishlist-deck", () => ({
  getOrCreateWishlistDeck: vi.fn(),
}));

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getOrCreateWishlistDeck } from "@/lib/deck/wishlist-deck";
import { setHolding, setWishlist } from "../inventory";

const mockRequireSession = vi.mocked(requireSession);
const mockGetSession = vi.mocked(getSession);
const mockRedirect = vi.mocked(redirect);
const mockPrintingFindUnique = vi.mocked(prisma.printing.findUnique);
const mockHoldingUpsert = vi.mocked(prisma.holding.upsert);
const mockHoldingDeleteMany = vi.mocked(prisma.holding.deleteMany);
const mockDeckCardFindFirst = vi.mocked(prisma.deckCard.findFirst);
const mockDeckCardCreate = vi.mocked(prisma.deckCard.create);
const mockDeckCardDeleteMany = vi.mocked(prisma.deckCard.deleteMany);
const mockDeckCategoryFindFirst = vi.mocked(prisma.deckCategory.findFirst);
const mockDeckCategoryUpsert = vi.mocked(prisma.deckCategory.upsert);
const mockDeckFindFirst = vi.mocked(prisma.deck.findFirst);
const mockGetOrCreateWishlistDeck = vi.mocked(getOrCreateWishlistDeck);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const PRINTING_ID = 42;
const CARD_ID = 7;
const WISHLIST_DECK_ID = "wishlist-deck-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({
    userId: USER_ID,
    email: "v@test.com",
  } as never);
  mockPrintingFindUnique.mockResolvedValue({
    finishes: ["nonfoil", "foil"],
    cardId: CARD_ID,
  } as never);
  mockGetOrCreateWishlistDeck.mockResolvedValue(WISHLIST_DECK_ID);
});

describe("setHolding", () => {
  it("upserts an OWNED row for the (user, printing, isFoil) key when quantity > 0", async () => {
    mockHoldingUpsert.mockResolvedValue({} as never);

    await setHolding(PRINTING_ID, false, 1);

    expect(mockHoldingUpsert).toHaveBeenCalledWith({
      where: {
        userId_printingId_isFoil: {
          userId: USER_ID,
          printingId: PRINTING_ID,
          isFoil: false,
        },
      },
      create: {
        userId: USER_ID,
        printingId: PRINTING_ID,
        isFoil: false,
        state: "OWNED",
        quantity: 1,
      },
      update: { state: "OWNED", quantity: 1 },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });

  it("deletes the row when quantity === 0 (idempotent clear)", async () => {
    mockHoldingDeleteMany.mockResolvedValue({ count: 1 } as never);

    await setHolding(PRINTING_ID, false, 0);

    expect(mockHoldingDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        printingId: PRINTING_ID,
        isFoil: false,
      },
    });
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });

  it("throws when the printing does not exist", async () => {
    mockPrintingFindUnique.mockResolvedValue(null);

    await expect(setHolding(PRINTING_ID, false, 1)).rejects.toThrow(
      "Printing not found",
    );
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
  });

  it("throws when isFoil=true but the printing has no foil finish", async () => {
    mockPrintingFindUnique.mockResolvedValue({
      finishes: ["nonfoil"],
    } as never);

    await expect(setHolding(PRINTING_ID, true, 1)).rejects.toThrow(
      "This printing is not available in foil",
    );
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in when no session", async () => {
    mockRequireSession.mockImplementation(async () => {
      mockGetSession.mockResolvedValue(null);
      redirect("/sign-in");
      throw new Error("unreachable");
    });

    await expect(setHolding(PRINTING_ID, false, 1)).rejects.toThrow(
      /NEXT_REDIRECT:\/sign-in/,
    );
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });

  it("rejects invalid quantity (negative)", async () => {
    await expect(setHolding(PRINTING_ID, false, -1)).rejects.toThrow();
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
    expect(mockHoldingDeleteMany).not.toHaveBeenCalled();
  });

  it("bumps only the viewer holdings tag — never a deck-scoped tag", async () => {
    mockHoldingUpsert.mockResolvedValue({} as never);

    await setHolding(PRINTING_ID, false, 1);

    expect(mockUpdateTag).toHaveBeenCalledTimes(1);
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });
});

describe("setWishlist", () => {
  it("creates a pinned DeckCard in the wishlist deck when on=true and none exists", async () => {
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);

    await setWishlist(PRINTING_ID, false, true);

    expect(mockGetOrCreateWishlistDeck).toHaveBeenCalledWith(USER_ID);
    expect(mockDeckCardFindFirst).toHaveBeenCalledWith({
      where: {
        deckId: WISHLIST_DECK_ID,
        cardId: CARD_ID,
        printingId: PRINTING_ID,
        isFoil: false,
      },
      select: { id: true },
    });
    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: {
        deckId: WISHLIST_DECK_ID,
        cardId: CARD_ID,
        printingId: PRINTING_ID,
        isFoil: false,
        zone: "MAINBOARD",
        quantity: 1,
      },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${WISHLIST_DECK_ID}`);
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });

  it("on=true is idempotent — does not re-create an existing wishlist DeckCard", async () => {
    mockDeckCardFindFirst.mockResolvedValue({ id: "dc-1" } as never);

    await setWishlist(PRINTING_ID, false, true);

    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("files a new wishlist DeckCard under a category named after the source deck", async () => {
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);
    mockDeckFindFirst.mockResolvedValue({ name: "Krenko Goblins" } as never);
    mockDeckCategoryFindFirst.mockResolvedValue(null);
    mockDeckCategoryUpsert.mockResolvedValue({ id: "cat-krenko" } as never);

    await setWishlist(PRINTING_ID, false, true, "deck-99");

    expect(mockDeckFindFirst).toHaveBeenCalledWith({
      where: { id: "deck-99", userId: USER_ID },
      select: { name: true },
    });
    // The source deck's name is registered (normalized) in the wishlist's
    // category registry on first use.
    expect(mockDeckCategoryUpsert).toHaveBeenCalledWith({
      where: {
        deckId_name: { deckId: WISHLIST_DECK_ID, name: "krenko goblins" },
      },
      create: {
        deckId: WISHLIST_DECK_ID,
        name: "krenko goblins",
        sortOrder: 0,
      },
      update: {},
      select: { id: true },
    });
    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: {
        deckId: WISHLIST_DECK_ID,
        cardId: CARD_ID,
        printingId: PRINTING_ID,
        isFoil: false,
        zone: "MAINBOARD",
        quantity: 1,
        categoryLinks: {
          create: [{ deckCategoryId: "cat-krenko", position: 0 }],
        },
      },
    });
  });

  it("appends the new category after existing registry entries (sortOrder = max+1)", async () => {
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);
    mockDeckFindFirst.mockResolvedValue({ name: "Krenko Goblins" } as never);
    mockDeckCategoryFindFirst.mockResolvedValue({ sortOrder: 3 } as never);
    mockDeckCategoryUpsert.mockResolvedValue({ id: "cat-krenko" } as never);

    await setWishlist(PRINTING_ID, false, true, "deck-99");

    expect(mockDeckCategoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ sortOrder: 4 }),
      }),
    );
  });

  it("leaves the card uncategorized when no source deck is given (non-deck context)", async () => {
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);

    await setWishlist(PRINTING_ID, false, true);

    expect(mockDeckFindFirst).not.toHaveBeenCalled();
    expect(mockDeckCategoryUpsert).not.toHaveBeenCalled();
    expect(mockDeckCardCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ categoryLinks: expect.anything() }),
      }),
    );
  });

  it("does not categorize when the source deck is the wishlist deck itself", async () => {
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);

    await setWishlist(PRINTING_ID, false, true, WISHLIST_DECK_ID);

    expect(mockDeckFindFirst).not.toHaveBeenCalled();
    expect(mockDeckCategoryUpsert).not.toHaveBeenCalled();
    expect(mockDeckCardCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ categoryLinks: expect.anything() }),
      }),
    );
  });

  it("falls back to uncategorized when the source deck no longer exists", async () => {
    mockDeckCardFindFirst.mockResolvedValue(null);
    mockDeckCardCreate.mockResolvedValue({} as never);
    mockDeckFindFirst.mockResolvedValue(null);

    await setWishlist(PRINTING_ID, false, true, "deck-gone");

    expect(mockDeckCategoryUpsert).not.toHaveBeenCalled();
    expect(mockDeckCardCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ categoryLinks: expect.anything() }),
      }),
    );
  });

  it("on=false deletes the matching pinned DeckCard from the wishlist deck", async () => {
    mockDeckCardDeleteMany.mockResolvedValue({ count: 1 } as never);

    await setWishlist(PRINTING_ID, false, false);

    expect(mockDeckCardDeleteMany).toHaveBeenCalledWith({
      where: {
        deckId: WISHLIST_DECK_ID,
        cardId: CARD_ID,
        printingId: PRINTING_ID,
        isFoil: false,
      },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("foil validation applies to wishlist too", async () => {
    mockPrintingFindUnique.mockResolvedValue({
      finishes: ["nonfoil"],
      cardId: CARD_ID,
    } as never);

    await expect(setWishlist(PRINTING_ID, true, true)).rejects.toThrow(
      "This printing is not available in foil",
    );
  });

  it("throws when the printing does not exist", async () => {
    mockPrintingFindUnique.mockResolvedValue(null);

    await expect(setWishlist(PRINTING_ID, false, true)).rejects.toThrow(
      "Printing not found",
    );
  });

  it("throws when the printing vanishes between the foil check and the cardId lookup", async () => {
    // First lookup (foil finishes) succeeds; second (cardId) returns null.
    mockPrintingFindUnique
      .mockResolvedValueOnce({ finishes: ["nonfoil", "foil"] } as never)
      .mockResolvedValueOnce(null);

    await expect(setWishlist(PRINTING_ID, false, true)).rejects.toThrow(
      "Printing not found",
    );
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });
});
