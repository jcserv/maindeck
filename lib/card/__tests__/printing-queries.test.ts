import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---------------------------------------------------------------

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    printing: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { getPrintingsForCard } from "../printing-queries";

const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPrintingsForCard", () => {
  it("returns printings for the given cardId, coercing Decimal prices to number", async () => {
    const printings = [
      {
        id: 10,
        cardId: 5,
        setCode: "MH3",
        setName: "Modern Horizons 3",
        priceUsd: { toString: () => "12.50" }, // Prisma Decimal-like
        priceUsdFoil: null,
        priceUsdEtched: null,
        priceEur: null,
        priceEurFoil: null,
        priceEurEtched: null,
      },
    ];
    mockPrintingFindMany.mockResolvedValue(printings as never);

    const result = await getPrintingsForCard(5);

    expect(mockPrintingFindMany).toHaveBeenCalledWith({
      where: { cardId: 5 },
      orderBy: { id: "desc" },
    });
    expect(result).toEqual([
      {
        id: 10,
        cardId: 5,
        setCode: "MH3",
        setName: "Modern Horizons 3",
        priceUsd: 12.5,
        priceUsdFoil: null,
        priceUsdEtched: null,
        priceEur: null,
        priceEurFoil: null,
        priceEurEtched: null,
      },
    ]);
  });

  it("returns an empty array when the card has no printings", async () => {
    mockPrintingFindMany.mockResolvedValue([] as never);

    const result = await getPrintingsForCard(999);

    expect(result).toEqual([]);
  });

  it("orders by id descending (newest first)", async () => {
    await getPrintingsForCard(1);

    expect(mockPrintingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: "desc" } }),
    );
  });
});
