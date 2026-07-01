import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    follow: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("../session", () => ({
  requireSession: vi.fn(),
  getSession: vi.fn(),
}));

import { prisma } from "@/lib/db";
import {
  canCollaborateOnDeck,
  requireDeckCollaborator,
  requireDeckOwner,
  requireDeckViewable,
} from "../deck-access";
import { getSession, requireSession } from "../session";

const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockFollowFindUnique = vi.mocked(prisma.follow.findUnique);
const mockRequireSession = vi.mocked(requireSession);
const mockGetSession = vi.mocked(getSession);

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const DECK_ID = "deck-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({
    userId: USER_ID,
    email: "test@test.com",
  } as never);
});

describe("requireDeckOwner", () => {
  it("returns the session when the caller owns the deck", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);

    const session = await requireDeckOwner(DECK_ID);

    expect(session).toEqual({ userId: USER_ID, email: "test@test.com" });
    expect(mockDeckFindUnique).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      select: { userId: true },
    });
  });

  it("404s when the deck does not exist", async () => {
    mockDeckFindUnique.mockResolvedValue(null);

    await expect(requireDeckOwner(DECK_ID)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the deck belongs to another user (no 403 / no leak)", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: OTHER_USER_ID } as never);

    await expect(requireDeckOwner(DECK_ID)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("requires a session before probing the deck (unauth → redirect)", async () => {
    mockRequireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));

    await expect(requireDeckOwner(DECK_ID)).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(mockDeckFindUnique).not.toHaveBeenCalled();
  });
});

describe("requireDeckViewable", () => {
  it("returns isOwner=true when the caller owns the deck", async () => {
    mockGetSession.mockResolvedValue({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: USER_ID,
      visibility: "PRIVATE",
    } as never);

    await expect(requireDeckViewable(DECK_ID)).resolves.toEqual({
      isOwner: true,
    });
    expect(mockDeckFindUnique).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      select: { userId: true, visibility: true },
    });
  });

  it("returns isOwner=false for a non-owner viewing a PUBLIC deck", async () => {
    mockGetSession.mockResolvedValue({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: OTHER_USER_ID,
      visibility: "PUBLIC",
    } as never);

    await expect(requireDeckViewable(DECK_ID)).resolves.toEqual({
      isOwner: false,
    });
  });

  it("returns isOwner=false for an unauthenticated viewer of an UNLISTED deck", async () => {
    mockGetSession.mockResolvedValue(null);
    mockDeckFindUnique.mockResolvedValue({
      userId: OTHER_USER_ID,
      visibility: "UNLISTED",
    } as never);

    await expect(requireDeckViewable(DECK_ID)).resolves.toEqual({
      isOwner: false,
    });
  });

  it("404s when the deck does not exist", async () => {
    mockGetSession.mockResolvedValue({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(null);

    await expect(requireDeckViewable(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("404s when a non-owner tries to view a PRIVATE deck", async () => {
    mockGetSession.mockResolvedValue({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: OTHER_USER_ID,
      visibility: "PRIVATE",
    } as never);

    await expect(requireDeckViewable(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("404s when an unauthenticated caller tries to view a PRIVATE deck", async () => {
    mockGetSession.mockResolvedValue(null);
    mockDeckFindUnique.mockResolvedValue({
      userId: OTHER_USER_ID,
      visibility: "PRIVATE",
    } as never);

    await expect(requireDeckViewable(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("canCollaborateOnDeck", () => {
  it("returns false when collaboration is disabled, even if the owner follows the candidate", async () => {
    mockFollowFindUnique.mockResolvedValue({
      followerId: USER_ID,
    } as never);

    const eligible = await canCollaborateOnDeck(
      { userId: USER_ID, collaborationEnabled: false },
      OTHER_USER_ID,
    );

    expect(eligible).toBe(false);
    expect(mockFollowFindUnique).not.toHaveBeenCalled();
  });

  it("returns false for the deck owner themselves (self-exclusion)", async () => {
    const eligible = await canCollaborateOnDeck(
      { userId: USER_ID, collaborationEnabled: true },
      USER_ID,
    );

    expect(eligible).toBe(false);
    expect(mockFollowFindUnique).not.toHaveBeenCalled();
  });

  it("returns false for an unauthenticated viewer", async () => {
    const eligible = await canCollaborateOnDeck(
      { userId: USER_ID, collaborationEnabled: true },
      undefined,
    );

    expect(eligible).toBe(false);
    expect(mockFollowFindUnique).not.toHaveBeenCalled();
  });

  it("returns false when the owner does not follow the candidate", async () => {
    mockFollowFindUnique.mockResolvedValue(null);

    const eligible = await canCollaborateOnDeck(
      { userId: USER_ID, collaborationEnabled: true },
      OTHER_USER_ID,
    );

    expect(eligible).toBe(false);
    expect(mockFollowFindUnique).toHaveBeenCalledWith({
      where: {
        followerId_followingId: {
          followerId: USER_ID,
          followingId: OTHER_USER_ID,
        },
      },
      select: { followerId: true },
    });
  });

  it("checks follow direction from owner to candidate, not the reverse", async () => {
    mockFollowFindUnique.mockResolvedValue(null);

    await canCollaborateOnDeck(
      { userId: USER_ID, collaborationEnabled: true },
      OTHER_USER_ID,
    );

    const call = mockFollowFindUnique.mock.calls[0]![0] as {
      where: { followerId_followingId: { followerId: string; followingId: string } };
    };
    expect(call.where.followerId_followingId.followerId).toBe(USER_ID);
    expect(call.where.followerId_followingId.followingId).toBe(
      OTHER_USER_ID,
    );
  });

  it("returns true when collaboration is enabled and the owner follows the candidate", async () => {
    mockFollowFindUnique.mockResolvedValue({
      followerId: USER_ID,
    } as never);

    const eligible = await canCollaborateOnDeck(
      { userId: USER_ID, collaborationEnabled: true },
      OTHER_USER_ID,
    );

    expect(eligible).toBe(true);
  });
});

describe("requireDeckCollaborator", () => {
  it("404s (not redirects) when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireDeckCollaborator(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockDeckFindUnique).not.toHaveBeenCalled();
  });

  it("404s when the deck does not exist", async () => {
    mockGetSession.mockResolvedValue({ userId: OTHER_USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(null);

    await expect(requireDeckCollaborator(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("404s when the caller is the deck owner (owner isn't a 'collaborator')", async () => {
    mockGetSession.mockResolvedValue({ userId: USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: USER_ID,
      collaborationEnabled: true,
    } as never);

    await expect(requireDeckCollaborator(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockFollowFindUnique).not.toHaveBeenCalled();
  });

  it("404s when collaboration is disabled on the deck", async () => {
    mockGetSession.mockResolvedValue({ userId: OTHER_USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: USER_ID,
      collaborationEnabled: false,
    } as never);

    await expect(requireDeckCollaborator(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("404s when the owner does not follow the candidate", async () => {
    mockGetSession.mockResolvedValue({ userId: OTHER_USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: USER_ID,
      collaborationEnabled: true,
    } as never);
    mockFollowFindUnique.mockResolvedValue(null);

    await expect(requireDeckCollaborator(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("returns deckId/userId/deck when the candidate is an eligible collaborator", async () => {
    mockGetSession.mockResolvedValue({ userId: OTHER_USER_ID } as never);
    mockDeckFindUnique.mockResolvedValue({
      userId: USER_ID,
      collaborationEnabled: true,
    } as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: USER_ID } as never);

    await expect(requireDeckCollaborator(DECK_ID)).resolves.toEqual({
      deckId: DECK_ID,
      userId: OTHER_USER_ID,
      deck: { userId: USER_ID, collaborationEnabled: true },
    });
  });
});
