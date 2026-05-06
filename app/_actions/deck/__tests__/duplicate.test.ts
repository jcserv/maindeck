import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    deckCard: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/generated/prisma/client";
import { duplicateDeck } from "../duplicate";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckCreate = vi.mocked(prisma.deck.create);
const mockCardCreateMany = vi.mocked(prisma.deckCard.createMany);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockUpdateTag = vi.mocked(updateTag);

const OWNER_ID = "owner-1";
const OTHER_ID = "other-1";
const DECK_ID = "deck-src";
const NEW_DECK_ID = "deck-new";

function makeDeck(visibility: Visibility, userId = OWNER_ID) {
  return {
    userId,
    name: "My Deck",
    description: "Cool deck",
    format: "COMMANDER",
    visibility,
    cards: [
      {
        cardId: 1,
        quantity: 2,
        zone: "MAINBOARD",
        category: "Ramp",
        isFoil: false,
        printingId: null,
      },
      {
        cardId: 2,
        quantity: 1,
        zone: "SIDEBOARD",
        category: null,
        isFoil: true,
        printingId: 5,
      },
      {
        cardId: 3,
        quantity: 1,
        zone: "COMMANDER",
        category: null,
        isFoil: false,
        printingId: null,
      },
    ],
    categories: [
      { name: "Ramp", sortOrder: 0 },
      { name: "Removal", sortOrder: 1 },
    ],
  };
}

function setupTransaction() {
  mockTransaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") {
      const tx = {
        deck: { create: mockDeckCreate },
        deckCard: { createMany: mockCardCreateMany },
      };
      return fn(tx);
    }
  });
  mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
  mockCardCreateMany.mockResolvedValue({ count: 3 } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: source deck has no further ancestors. Tests that need ancestors
  // override this in their own setup.
  mockQueryRaw.mockResolvedValue([] as never);
});

describe("duplicateDeck", () => {
  it("owner can duplicate a private deck and copies all cards + categories with zone and subcategory", async () => {
    mockSession.mockResolvedValue({ userId: OWNER_ID, email: "owner@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(makeDeck(Visibility.PRIVATE) as never);
    setupTransaction();

    const result = await duplicateDeck(DECK_ID);

    expect(result).toEqual({ id: NEW_DECK_ID });

    expect(mockDeckCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "My Deck (Copy)",
          visibility: Visibility.PRIVATE,
          forkedFromId: DECK_ID,
          userId: OWNER_ID,
          categories: {
            createMany: {
              data: expect.arrayContaining([
                expect.objectContaining({ name: "Ramp", sortOrder: 0 }),
                expect.objectContaining({ name: "Removal", sortOrder: 1 }),
              ]),
            },
          },
        }),
      }),
    );

    expect(mockCardCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          cardId: 1,
          quantity: 2,
          zone: "MAINBOARD",
          category: "Ramp",
        }),
        expect.objectContaining({
          cardId: 2,
          quantity: 1,
          zone: "SIDEBOARD",
          category: null,
        }),
        expect.objectContaining({
          cardId: 3,
          quantity: 1,
          zone: "COMMANDER",
          category: null,
        }),
      ]),
    });

    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${NEW_DECK_ID}`);
    // Source deck's fork-lineage tag is always bumped so its "Forks" rail
    // invalidates.
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}:forks`);
  });

  it("walks the ancestor chain and bumps forkLineageTag for each ancestor", async () => {
    mockSession.mockResolvedValue({ userId: OWNER_ID, email: "owner@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(makeDeck(Visibility.PUBLIC) as never);
    setupTransaction();
    // Ancestor walk: source has two transitive ancestors.
    mockQueryRaw.mockResolvedValueOnce([
      { id: "ancestor-1", depth: 1 },
      { id: "ancestor-2", depth: 2 },
    ] as never);

    await duplicateDeck(DECK_ID);

    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}:forks`);
    expect(mockUpdateTag).toHaveBeenCalledWith("deck:ancestor-1:forks");
    expect(mockUpdateTag).toHaveBeenCalledWith("deck:ancestor-2:forks");
  });

  it("duplicate is always PRIVATE regardless of original visibility", async () => {
    mockSession.mockResolvedValue({ userId: OWNER_ID, email: "owner@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(makeDeck(Visibility.PUBLIC) as never);
    setupTransaction();

    await duplicateDeck(DECK_ID);

    expect(mockDeckCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: Visibility.PRIVATE }),
      }),
    );
  });

  it("non-owner can duplicate a PUBLIC deck, and forkedFromId is set", async () => {
    mockSession.mockResolvedValue({ userId: OTHER_ID, email: "other@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(makeDeck(Visibility.PUBLIC) as never);
    setupTransaction();

    const result = await duplicateDeck(DECK_ID);

    expect(result).toEqual({ id: NEW_DECK_ID });
    expect(mockDeckCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: OTHER_ID,
          forkedFromId: DECK_ID,
          visibility: Visibility.PRIVATE,
        }),
      }),
    );
  });

  it("non-owner can duplicate an UNLISTED deck", async () => {
    mockSession.mockResolvedValue({ userId: OTHER_ID, email: "other@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(makeDeck(Visibility.UNLISTED) as never);
    setupTransaction();

    const result = await duplicateDeck(DECK_ID);
    expect(result).toEqual({ id: NEW_DECK_ID });
  });

  it("non-owner cannot duplicate a PRIVATE deck", async () => {
    mockSession.mockResolvedValue({ userId: OTHER_ID, email: "other@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(makeDeck(Visibility.PRIVATE) as never);

    await expect(duplicateDeck(DECK_ID)).rejects.toThrow(
      "Not authorized to duplicate this deck",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("throws when the deck does not exist", async () => {
    mockSession.mockResolvedValue({ userId: OWNER_ID, email: "owner@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(null as never);

    await expect(duplicateDeck(DECK_ID)).rejects.toThrow("Deck not found");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("preserves card fields: isFoil and printingId", async () => {
    mockSession.mockResolvedValue({ userId: OWNER_ID, email: "owner@test.com" } as never);
    mockDeckFindUnique.mockResolvedValue(makeDeck(Visibility.PRIVATE) as never);
    setupTransaction();

    await duplicateDeck(DECK_ID);

    expect(mockCardCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ isFoil: true, printingId: 5 }),
      ]),
    });
  });

  it("skips deckCard.createMany when the source deck has no cards", async () => {
    mockSession.mockResolvedValue({ userId: OWNER_ID, email: "owner@test.com" } as never);
    const emptyDeck = { ...makeDeck(Visibility.PRIVATE), cards: [] };
    mockDeckFindUnique.mockResolvedValue(emptyDeck as never);
    setupTransaction();

    const result = await duplicateDeck(DECK_ID);

    expect(result).toEqual({ id: NEW_DECK_ID });
    expect(mockDeckCreate).toHaveBeenCalled();
    expect(mockCardCreateMany).not.toHaveBeenCalled();
  });
});
