import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { getOrCreateWishlistDeck } from "../wishlist-deck";

const mockFindFirst = vi.mocked(prisma.deck.findFirst);
const mockCreate = vi.mocked(prisma.deck.create);

const USER_ID = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateWishlistDeck", () => {
  it("returns the existing wishlist deck id without creating", async () => {
    mockFindFirst.mockResolvedValue({ id: "wl-1" } as never);

    const id = await getOrCreateWishlistDeck(USER_ID);

    expect(id).toBe("wl-1");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: USER_ID, kind: "WISHLIST" },
      select: { id: true },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a private CASUAL wishlist deck when none exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "wl-new" } as never);

    const id = await getOrCreateWishlistDeck(USER_ID);

    expect(id).toBe("wl-new");
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        name: "Wishlist",
        format: "CASUAL",
        visibility: "PRIVATE",
        kind: "WISHLIST",
      },
      select: { id: true },
    });
  });
});
