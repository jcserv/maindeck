import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findMany: vi.fn() },
    deckCard: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getPackagesByUser } from "../package-queries";

const mockFindMany = vi.mocked(prisma.deck.findMany);
const mockGroupBy = vi.mocked(prisma.deckCard.groupBy);

function pkg(id: string) {
  return {
    id,
    name: id,
    description: null,
    visibility: "PRIVATE",
    updatedAt: new Date(0),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPackagesByUser", () => {
  it("counts copies per package and reports empty packages as zero", async () => {
    mockFindMany.mockResolvedValue([pkg("a"), pkg("b"), pkg("c")] as never);
    mockGroupBy.mockResolvedValue([
      { deckId: "a", _sum: { quantity: 14 } },
      { deckId: "b", _sum: { quantity: null } },
    ] as never);

    const result = await getPackagesByUser("user-1");

    expect(result.map((p) => [p.id, p.cardCount])).toEqual([
      ["a", 14],
      ["b", 0],
      ["c", 0],
    ]);
  });

  it("skips the count query when the user has no packages", async () => {
    mockFindMany.mockResolvedValue([] as never);

    await expect(getPackagesByUser("user-1")).resolves.toEqual([]);
    expect(mockGroupBy).not.toHaveBeenCalled();
  });
});
