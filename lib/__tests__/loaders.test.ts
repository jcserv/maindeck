import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findMany: vi.fn() },
    printing: { findMany: vi.fn() },
    deckCategory: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { createLoaders } from "../loaders";

const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);
const mockCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cardById", () => {
  it("issues a single findMany for a batch and preserves key order", async () => {
    mockCardFindMany.mockResolvedValue([
      { id: 2, name: "Two" },
      { id: 1, name: "One" },
    ] as never);

    const { cardById } = createLoaders();
    const result = await Promise.all([cardById.load(1), cardById.load(2)]);

    expect(mockCardFindMany).toHaveBeenCalledTimes(1);
    expect(mockCardFindMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
    });
    expect(result.map((r) => r && r.id)).toEqual([1, 2]);
  });

  it("returns null for missing keys", async () => {
    mockCardFindMany.mockResolvedValue([{ id: 1, name: "One" }] as never);

    const { cardById } = createLoaders();
    const [a, b] = await Promise.all([cardById.load(1), cardById.load(99)]);

    expect(a).toMatchObject({ id: 1 });
    expect(b).toBeNull();
  });
});

describe("printingsByCardId", () => {
  it("groups printings by cardId and yields [] for cards with none", async () => {
    mockPrintingFindMany.mockResolvedValue([
      { id: 10, cardId: 1 },
      { id: 11, cardId: 1 },
      { id: 20, cardId: 2 },
    ] as never);

    const { printingsByCardId } = createLoaders();
    const [forOne, forThree] = await Promise.all([
      printingsByCardId.load(1),
      printingsByCardId.load(3),
    ]);

    expect(forOne.map((p) => p.id)).toEqual([10, 11]);
    expect(forThree).toEqual([]);
    expect(mockPrintingFindMany).toHaveBeenCalledTimes(1);
  });
});

describe("categoriesByDeckId", () => {
  it("groups categories by deckId ordered by sortOrder", async () => {
    mockCategoryFindMany.mockResolvedValue([
      { id: "c1", deckId: "d1", name: "Ramp", sortOrder: 0 },
      { id: "c2", deckId: "d1", name: "Removal", sortOrder: 1 },
    ] as never);

    const { categoriesByDeckId } = createLoaders();
    const result = await categoriesByDeckId.load("d1");

    expect(result.map((c) => c.name)).toEqual(["Ramp", "Removal"]);
    expect(mockCategoryFindMany).toHaveBeenCalledWith({
      where: { deckId: { in: ["d1"] } },
      orderBy: { sortOrder: "asc" },
    });
  });
});

describe("cardByName", () => {
  it("dedupes case-insensitive lookups via cacheKeyFn", async () => {
    mockCardFindMany.mockResolvedValue([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const { cardByName } = createLoaders();
    const [a, b] = await Promise.all([
      cardByName.load("lightning bolt"),
      cardByName.load("LIGHTNING BOLT"),
    ]);

    expect(mockCardFindMany).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ id: 1 });
    expect(b).toMatchObject({ id: 1 });
  });

  it("returns null for unmatched names", async () => {
    mockCardFindMany.mockResolvedValue([] as never);

    const { cardByName } = createLoaders();
    await expect(cardByName.load("nonexistent")).resolves.toBeNull();
  });
});
