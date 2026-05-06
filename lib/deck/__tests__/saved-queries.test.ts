import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    savedDeck: {
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
  getSavedDecksForUser,
  isDeckSavedByUser,
} from "../saved-queries";

const mockFindMany = vi.mocked(prisma.savedDeck.findMany);
const mockFindUnique = vi.mocked(prisma.savedDeck.findUnique);
const mockCount = vi.mocked(prisma.savedDeck.count);
const mockGroupBy = vi.mocked(prisma.deckCard.groupBy);
const mockCacheTag = vi.mocked(cacheTag);

const USER_ID = "user-1";
const OTHER_ID = "user-2";

beforeEach(() => {
  vi.clearAllMocks();
  mockGroupBy.mockResolvedValue([] as never);
});

function row(
  deckId: string,
  deck: {
    userId: string;
    visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
    name?: string;
    cards?: unknown[];
  } | null,
  createdAt = new Date("2026-04-01"),
) {
  return {
    deckId,
    createdAt,
    deck: deck === null
      ? null
      : {
          id: deckId,
          userId: deck.userId,
          name: deck.name ?? "Some Deck",
          format: "COMMANDER",
          visibility: deck.visibility,
          updatedAt: new Date("2026-03-01"),
          user: { username: "creator", image: null },
          cards: deck.cards ?? [],
        },
  };
}

describe("getSavedDecksForUser", () => {
  it("tags the per-user cache and orders rows newest-first with pagination", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getSavedDecksForUser({ userId: USER_ID, page: 2, pageSize: 10 });

    expect(mockCacheTag).toHaveBeenCalledWith(`saved-decks:${USER_ID}`);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        orderBy: { createdAt: "desc" },
        skip: 10,
        take: 10,
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it("clamps page <= 0 to page 1 (skip = 0)", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getSavedDecksForUser({ userId: USER_ID, page: 0, pageSize: 24 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 24 }),
    );
  });

  it("returns deck info for PUBLIC and UNLISTED decks the visitor saved", async () => {
    mockFindMany.mockResolvedValue([
      row("d-pub", { userId: OTHER_ID, visibility: "PUBLIC", name: "Public" }),
      row("d-unl", { userId: OTHER_ID, visibility: "UNLISTED", name: "Unlisted" }),
    ] as never);
    mockCount.mockResolvedValue(2 as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "d-pub", _sum: { quantity: 60 } },
      { deckId: "d-unl", _sum: { quantity: 100 } },
    ] as never);

    const result = await getSavedDecksForUser({
      userId: USER_ID,
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.deck?.name).toBe("Public");
    expect(result.items[0]!.deck?.cardCount).toBe(60);
    expect(result.items[1]!.deck?.name).toBe("Unlisted");
    expect(result.items[1]!.deck?.cardCount).toBe(100);
  });

  it("hides deck details for items that are now PRIVATE-and-not-owned (no longer available)", async () => {
    mockFindMany.mockResolvedValue([
      row("d-secret", { userId: OTHER_ID, visibility: "PRIVATE" }),
      row("d-public", { userId: OTHER_ID, visibility: "PUBLIC" }),
    ] as never);
    mockCount.mockResolvedValue(2 as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "d-public", _sum: { quantity: 100 } },
    ] as never);

    const result = await getSavedDecksForUser({
      userId: USER_ID,
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]!.deck).toBeNull();
    expect(result.items[0]!.deckId).toBe("d-secret");
    expect(result.items[1]!.deck?.cardCount).toBe(100);

    // groupBy should only be called for visible decks — never for d-secret.
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deckId: { in: ["d-public"] } }),
      }),
    );
  });

  it("returns deck info for a PRIVATE deck the saver still owns", async () => {
    mockFindMany.mockResolvedValue([
      row("d-mine", { userId: USER_ID, visibility: "PRIVATE", name: "Mine" }),
    ] as never);
    mockCount.mockResolvedValue(1 as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "d-mine", _sum: { quantity: 99 } },
    ] as never);

    const result = await getSavedDecksForUser({
      userId: USER_ID,
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]!.deck?.name).toBe("Mine");
    expect(result.items[0]!.deck?.cardCount).toBe(99);
  });

  it("collapses to deck: null when the saved deck row was hard-deleted (deck=null)", async () => {
    mockFindMany.mockResolvedValue([row("d-gone", null)] as never);
    mockCount.mockResolvedValue(1 as never);

    const result = await getSavedDecksForUser({
      userId: USER_ID,
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]!.deck).toBeNull();
    expect(result.items[0]!.deckId).toBe("d-gone");
  });

  it("defaults cardCount to 0 when groupBy has no row for a deck", async () => {
    mockFindMany.mockResolvedValue([
      row("d-empty", { userId: OTHER_ID, visibility: "PUBLIC" }),
    ] as never);
    mockCount.mockResolvedValue(1 as never);
    // groupBy returns the row but with a null _sum, hitting the `?? 0` fallback.
    mockGroupBy.mockResolvedValue([
      { deckId: "d-empty", _sum: { quantity: null } },
    ] as never);

    const result = await getSavedDecksForUser({
      userId: USER_ID,
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]!.deck?.cardCount).toBe(0);
  });

  it("falls back to 0 when groupBy omits the deckId entirely", async () => {
    mockFindMany.mockResolvedValue([
      row("d-no-cards", { userId: OTHER_ID, visibility: "PUBLIC" }),
    ] as never);
    mockCount.mockResolvedValue(1 as never);
    mockGroupBy.mockResolvedValue([] as never);

    const result = await getSavedDecksForUser({
      userId: USER_ID,
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]!.deck?.cardCount).toBe(0);
  });
});

describe("isDeckSavedByUser", () => {
  it("tags the per-user saved-decks cache and returns true when a row exists", async () => {
    mockFindUnique.mockResolvedValue({ userId: USER_ID } as never);

    const result = await isDeckSavedByUser({
      userId: USER_ID,
      deckId: "deck-1",
    });

    expect(result).toBe(true);
    expect(mockCacheTag).toHaveBeenCalledWith(`saved-decks:${USER_ID}`);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId_deckId: { userId: USER_ID, deckId: "deck-1" } },
      select: { userId: true },
    });
  });

  it("returns false when no row exists", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await isDeckSavedByUser({
      userId: USER_ID,
      deckId: "deck-1",
    });

    expect(result).toBe(false);
  });
});
