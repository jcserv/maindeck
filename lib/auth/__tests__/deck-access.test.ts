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
  },
}));
vi.mock("../session", () => ({
  requireSession: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireDeckOwner } from "../deck-access";
import { requireSession } from "../session";

const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockRequireSession = vi.mocked(requireSession);

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
