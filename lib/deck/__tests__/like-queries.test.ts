import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    deckCard: {
      groupBy: vi.fn(),
    },
    deckLike: {
      findUnique: vi.fn(),
    },
  },
}));

import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import {
  getDeckById,
  getPublicDecksWithPreview,
  hasViewerLikedDeck,
} from "../queries";

const mockFindUnique = vi.mocked(prisma.deck.findUnique);
const mockFindMany = vi.mocked(prisma.deck.findMany);
const mockCount = vi.mocked(prisma.deck.count);
const mockGroupBy = vi.mocked(prisma.deckCard.groupBy);
const mockLikeFindUnique = vi.mocked(prisma.deckLike.findUnique);
const mockCacheTag = vi.mocked(cacheTag);

const DECK_ID = "deck-1";
const USER_ID = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockGroupBy.mockResolvedValue([] as never);
});

describe("getDeckById likeCount", () => {
  it("requests `_count.likes` and returns it as `likeCount`", async () => {
    mockFindUnique.mockResolvedValue({
      id: DECK_ID,
      cards: [],
      _count: { likes: 7 },
    } as never);

    const result = await getDeckById(DECK_ID);

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DECK_ID },
        select: expect.objectContaining({
          _count: { select: { likes: true } },
        }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.likeCount).toBe(7);
    // The raw `_count` field shouldn't leak to consumers.
    expect((result as unknown as { _count?: unknown })._count).toBeUndefined();
  });

  it("defaults likeCount to 0 when `_count` is missing (e.g. legacy fixtures)", async () => {
    mockFindUnique.mockResolvedValue({
      id: DECK_ID,
      cards: [],
    } as never);

    const result = await getDeckById(DECK_ID);

    expect(result).not.toBeNull();
    expect(result!.likeCount).toBe(0);
  });

  it("tags the per-deck likes cache so like/unlike invalidations reach this query", async () => {
    mockFindUnique.mockResolvedValue(null);

    await getDeckById(DECK_ID);

    expect(mockCacheTag).toHaveBeenCalledWith(`deck:${DECK_ID}:likes`);
  });
});

describe("getPublicDecksWithPreview likeCount", () => {
  function publicDeckRow(id: string, likes: number) {
    return {
      id,
      name: `Deck ${id}`,
      format: "COMMANDER",
      visibility: "PUBLIC",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      releasedAt: null,
      externalSource: null,
      _count: { likes },
      user: { username: "alice", image: null },
      cards: [],
    };
  }

  it("returns likeCount on each card", async () => {
    mockFindMany.mockResolvedValue([
      publicDeckRow("d1", 3),
      publicDeckRow("d2", 0),
    ] as never);
    mockCount.mockResolvedValue(2 as never);

    const { decks } = await getPublicDecksWithPreview({
      page: 1,
      pageSize: 10,
    });

    expect(decks).toHaveLength(2);
    expect(decks[0]!.likeCount).toBe(3);
    expect(decks[1]!.likeCount).toBe(0);
    // Internal `_count` should be stripped out of the public shape.
    expect((decks[0] as unknown as { _count?: unknown })._count).toBeUndefined();
  });

  it("requests `_count.likes` in the select", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { likes: true } },
        }),
      }),
    );
  });

  it("tags the per-deck likes cache for each visible deck so likes invalidate the listing", async () => {
    mockFindMany.mockResolvedValue([
      publicDeckRow("d1", 1),
      publicDeckRow("d2", 2),
    ] as never);
    mockCount.mockResolvedValue(2 as never);

    await getPublicDecksWithPreview({ page: 1, pageSize: 10 });

    expect(mockCacheTag).toHaveBeenCalledWith("deck:d1:likes");
    expect(mockCacheTag).toHaveBeenCalledWith("deck:d2:likes");
  });

  it("defaults likeCount to 0 when `_count` is missing", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "d1",
        name: "x",
        format: "COMMANDER",
        visibility: "PUBLIC",
        createdAt: new Date(),
        updatedAt: new Date(),
        releasedAt: null,
        externalSource: null,
        user: { username: "alice", image: null },
        cards: [],
      },
    ] as never);
    mockCount.mockResolvedValue(1 as never);

    const { decks } = await getPublicDecksWithPreview({
      page: 1,
      pageSize: 10,
    });

    expect(decks[0]!.likeCount).toBe(0);
  });
});

describe("hasViewerLikedDeck", () => {
  it("returns false immediately when no userId is supplied (anonymous viewer)", async () => {
    const result = await hasViewerLikedDeck(DECK_ID, undefined);

    expect(result).toBe(false);
    expect(mockLikeFindUnique).not.toHaveBeenCalled();
  });

  it("returns true when a like row exists for the user/deck pair", async () => {
    mockLikeFindUnique.mockResolvedValue({ userId: USER_ID } as never);

    const result = await hasViewerLikedDeck(DECK_ID, USER_ID);

    expect(result).toBe(true);
    expect(mockLikeFindUnique).toHaveBeenCalledWith({
      where: { userId_deckId: { userId: USER_ID, deckId: DECK_ID } },
      select: { userId: true },
    });
  });

  it("returns false when no like row exists", async () => {
    mockLikeFindUnique.mockResolvedValue(null);

    const result = await hasViewerLikedDeck(DECK_ID, USER_ID);

    expect(result).toBe(false);
  });
});
