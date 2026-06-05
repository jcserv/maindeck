import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    deckCard: { findMany: vi.fn() },
    holding: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getViewerHoldingsForDeck } from "../queries";

const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockHoldingFindMany = vi.mocked(prisma.holding.findMany);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getViewerHoldingsForDeck", () => {
  it("returns [] immediately when no userId is supplied", async () => {
    const result = await getViewerHoldingsForDeck(DECK_ID, undefined);

    expect(result).toEqual([]);
    expect(mockDeckCardFindMany).not.toHaveBeenCalled();
    expect(mockHoldingFindMany).not.toHaveBeenCalled();
  });

  it("returns [] when the deck has no cards (skips the holdings round-trip)", async () => {
    mockDeckCardFindMany.mockResolvedValue([] as never);

    const result = await getViewerHoldingsForDeck(DECK_ID, USER_ID);

    expect(result).toEqual([]);
    expect(mockHoldingFindMany).not.toHaveBeenCalled();
  });

  it("merges OWNED holdings with synthetic WISHLIST holdings from the wishlist deck", async () => {
    // 1st call: this deck's cards. 2nd call: viewer's wishlist-deck cards.
    mockDeckCardFindMany
      .mockResolvedValueOnce([
        { cardId: 1, printingId: 10 },
        { cardId: 2, printingId: null },
      ] as never)
      .mockResolvedValueOnce([
        { cardId: 2, printingId: 20, isFoil: true },
      ] as never);
    mockHoldingFindMany.mockResolvedValue([
      {
        printingId: 10,
        isFoil: false,
        state: "OWNED",
        printing: { cardId: 1 },
      },
    ] as never);

    const result = await getViewerHoldingsForDeck(DECK_ID, USER_ID);

    expect(mockHoldingFindMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        OR: [
          { printingId: { in: [10] } },
          { printing: { cardId: { in: [1, 2] } } },
        ],
      },
      select: {
        printingId: true,
        isFoil: true,
        state: true,
        printing: { select: { cardId: true } },
      },
    });
    expect(mockDeckCardFindMany).toHaveBeenLastCalledWith({
      where: {
        deck: { is: { userId: USER_ID, kind: "WISHLIST" } },
        cardId: { in: [1, 2] },
      },
      select: { cardId: true, printingId: true, isFoil: true },
    });
    expect(result).toEqual([
      { cardId: 1, printingId: 10, isFoil: false, state: "OWNED" },
      { cardId: 2, printingId: 20, isFoil: true, state: "WISHLIST" },
    ]);
  });
});

describe("inventory queries caching", () => {
  it("source does NOT contain `'use cache'` — ownership reads must never enter the deck-scoped cache", () => {
    const queriesPath = fileURLToPath(new URL("../queries.ts", import.meta.url));
    const source = readFileSync(queriesPath, "utf8");
    expect(source).not.toContain("'use cache'");
    expect(source).not.toContain('"use cache"');
  });
});
