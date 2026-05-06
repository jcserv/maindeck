import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    deckLike: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Visibility } from "@/lib/generated/prisma/enums";
import { likeDeck, unlikeDeck } from "../deck-likes";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockUpsert = vi.mocked(prisma.deckLike.upsert);
const mockDeleteMany = vi.mocked(prisma.deckLike.deleteMany);
const mockUpdateTag = vi.mocked(updateTag);

const VIEWER_ID = "user-viewer";
const OWNER_ID = "user-owner";
const DECK_ID = "deck-1";
const LIKES_TAG = `deck:${DECK_ID}:likes`;

function session(userId: string) {
  return {
    userId,
    email: `${userId}@test.com`,
    username: userId,
    dateOfBirth: new Date("1990-01-01"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("likeDeck", () => {
  it("upserts a like row keyed by (userId, deckId) when the deck is PUBLIC", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PUBLIC,
    } as never);
    mockUpsert.mockResolvedValue({} as never);

    await likeDeck(DECK_ID);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId_deckId: { userId: VIEWER_ID, deckId: DECK_ID } },
      create: { userId: VIEWER_ID, deckId: DECK_ID },
      update: {},
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(LIKES_TAG);
  });

  it("does not bump publicDecksTag — likes are too frequent to invalidate explore on every click", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PUBLIC,
    } as never);
    mockUpsert.mockResolvedValue({} as never);

    await likeDeck(DECK_ID);

    expect(mockUpdateTag).not.toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).not.toHaveBeenCalledWith("deck-list");
  });

  it("is idempotent — a second call still resolves and only the per-deck likes tag is bumped", async () => {
    // The composite primary key means upsert can be called twice with no error;
    // this test asserts the action contract, not Prisma's behaviour.
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PUBLIC,
    } as never);
    mockUpsert.mockResolvedValue({} as never);

    await likeDeck(DECK_ID);
    await likeDeck(DECK_ID);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    // Both invalidations target the same per-deck tag.
    expect(
      mockUpdateTag.mock.calls.every(([tag]) => tag === LIKES_TAG),
    ).toBe(true);
  });

  it("allows self-likes (owner liking their own public deck)", async () => {
    mockSession.mockResolvedValue(session(OWNER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PUBLIC,
    } as never);
    mockUpsert.mockResolvedValue({} as never);

    await likeDeck(DECK_ID);

    expect(mockUpsert).toHaveBeenCalled();
  });

  it("rejects when the deck is PRIVATE", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PRIVATE,
    } as never);

    await expect(likeDeck(DECK_ID)).rejects.toThrow(
      "Only public decks can be liked",
    );
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("rejects when the deck is UNLISTED", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.UNLISTED,
    } as never);

    await expect(likeDeck(DECK_ID)).rejects.toThrow(
      "Only public decks can be liked",
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects when the deck does not exist", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue(null);

    await expect(likeDeck(DECK_ID)).rejects.toThrow("Deck not found");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("unlikeDeck", () => {
  it("deletes the like row matching (userId, deckId) when the deck is PUBLIC", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PUBLIC,
    } as never);
    mockDeleteMany.mockResolvedValue({ count: 1 } as never);

    await unlikeDeck(DECK_ID);

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: VIEWER_ID, deckId: DECK_ID },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(LIKES_TAG);
  });

  it("is idempotent — unliking when no row exists is a no-op (deleteMany returns count: 0)", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PUBLIC,
    } as never);
    mockDeleteMany.mockResolvedValue({ count: 0 } as never);

    await unlikeDeck(DECK_ID);

    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateTag).toHaveBeenCalledWith(LIKES_TAG);
  });

  it("rejects when the deck is PRIVATE", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.PRIVATE,
    } as never);

    await expect(unlikeDeck(DECK_ID)).rejects.toThrow(
      "Only public decks can be liked",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects when the deck is UNLISTED", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue({
      visibility: Visibility.UNLISTED,
    } as never);

    await expect(unlikeDeck(DECK_ID)).rejects.toThrow(
      "Only public decks can be liked",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects when the deck does not exist", async () => {
    mockSession.mockResolvedValue(session(VIEWER_ID));
    mockDeckFindUnique.mockResolvedValue(null);

    await expect(unlikeDeck(DECK_ID)).rejects.toThrow("Deck not found");
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
