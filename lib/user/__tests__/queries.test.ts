import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    deck: {
      findMany: vi.fn(),
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
  getPublicProfile,
  getUserPublicDecks,
  getUserUnlistedDecks,
  PROFILE_DECKS_PAGE_SIZE,
} from "../queries";

const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockDeckFindMany = vi.mocked(prisma.deck.findMany);
const mockDeckCount = vi.mocked(prisma.deck.count);
const mockGroupBy = vi.mocked(prisma.deckCard.groupBy);
const mockCacheTag = vi.mocked(cacheTag);

const USERNAME = "alice";
const USER_ID = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockGroupBy.mockResolvedValue([] as never);
});

describe("getPublicProfile", () => {
  it("returns null when no user with that username exists (drives 404 in the route)", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const result = await getPublicProfile("ghost");

    expect(result).toBeNull();
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { username: "ghost" },
      select: { id: true, username: true },
    });
  });

  it("returns the id+username and tags the per-username cache", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: USER_ID,
      username: USERNAME,
    } as never);

    const result = await getPublicProfile(USERNAME);

    expect(result).toEqual({ id: USER_ID, username: USERNAME });
    expect(mockCacheTag).toHaveBeenCalledWith(`user:${USERNAME}`);
  });
});

describe("getUserPublicDecks", () => {
  it("scopes findMany to PUBLIC visibility for the user, paginates from page 1, and tags the per-user public-deck cache", async () => {
    mockDeckFindMany.mockResolvedValue([] as never);
    mockDeckCount.mockResolvedValue(0 as never);

    await getUserPublicDecks(USER_ID, 1);

    expect(mockCacheTag).toHaveBeenCalledWith(`decks:user:${USER_ID}:public`);
    expect(mockDeckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, visibility: "PUBLIC" },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: PROFILE_DECKS_PAGE_SIZE,
      }),
    );
    expect(mockDeckCount).toHaveBeenCalledWith({
      where: { userId: USER_ID, visibility: "PUBLIC" },
    });
  });

  it("paginates with `(page - 1) * PAGE_SIZE` skip for later pages", async () => {
    mockDeckFindMany.mockResolvedValue([] as never);
    mockDeckCount.mockResolvedValue(0 as never);

    await getUserPublicDecks(USER_ID, 3);

    expect(mockDeckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: PROFILE_DECKS_PAGE_SIZE * 2,
        take: PROFILE_DECKS_PAGE_SIZE,
      }),
    );
  });

  it("clamps a 0 (or negative) page to page 1 (skip = 0)", async () => {
    mockDeckFindMany.mockResolvedValue([] as never);
    mockDeckCount.mockResolvedValue(0 as never);

    await getUserPublicDecks(USER_ID, 0);

    expect(mockDeckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });

  it("attaches cardCount from the groupBy result and defaults to 0 when missing", async () => {
    mockDeckFindMany.mockResolvedValue([
      {
        id: "deck-a",
        name: "A",
        format: "MODERN",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-01"),
        cards: [],
      },
      {
        id: "deck-b",
        name: "B",
        format: "MODERN",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-02"),
        cards: [],
      },
    ] as never);
    mockDeckCount.mockResolvedValue(2 as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "deck-a", _sum: { quantity: 60 } },
    ] as never);

    const { decks, total } = await getUserPublicDecks(USER_ID, 1);

    expect(total).toBe(2);
    expect(decks).toHaveLength(2);
    expect(decks[0]!.cardCount).toBe(60);
    expect(decks[1]!.cardCount).toBe(0);
  });

  it("defaults cardCount to 0 when groupBy returns a null _sum.quantity", async () => {
    mockDeckFindMany.mockResolvedValue([
      {
        id: "deck-a",
        name: "A",
        format: "MODERN",
        visibility: "PUBLIC",
        updatedAt: new Date("2026-01-01"),
        cards: [],
      },
    ] as never);
    mockDeckCount.mockResolvedValue(1 as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "deck-a", _sum: { quantity: null } },
    ] as never);

    const { decks } = await getUserPublicDecks(USER_ID, 1);

    expect(decks[0]!.cardCount).toBe(0);
  });

  it("skips the groupBy round-trip when there are no decks on the page", async () => {
    mockDeckFindMany.mockResolvedValue([] as never);
    mockDeckCount.mockResolvedValue(0 as never);

    await getUserPublicDecks(USER_ID, 99);

    expect(mockGroupBy).not.toHaveBeenCalled();
  });
});

describe("getUserUnlistedDecks", () => {
  it("scopes findMany to UNLISTED visibility and tags the per-user public-deck cache", async () => {
    mockDeckFindMany.mockResolvedValue([] as never);
    mockDeckCount.mockResolvedValue(0 as never);

    await getUserUnlistedDecks(USER_ID, 1);

    expect(mockCacheTag).toHaveBeenCalledWith(`decks:user:${USER_ID}:public`);
    expect(mockDeckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, visibility: "UNLISTED" },
        skip: 0,
        take: PROFILE_DECKS_PAGE_SIZE,
      }),
    );
    expect(mockDeckCount).toHaveBeenCalledWith({
      where: { userId: USER_ID, visibility: "UNLISTED" },
    });
  });
});
