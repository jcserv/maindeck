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
  it("returns printings for the given cardId", async () => {
    const printings = [
      { id: 10, cardId: 5, setCode: "MH3", setName: "Modern Horizons 3" },
      { id: 9, cardId: 5, setCode: "MH2", setName: "Modern Horizons 2" },
    ];
    mockPrintingFindMany.mockResolvedValue(printings as never);

    const result = await getPrintingsForCard(5);

    expect(mockPrintingFindMany).toHaveBeenCalledWith({
      where: { cardId: 5 },
      orderBy: { id: "desc" },
    });
    expect(result).toEqual(printings);
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
