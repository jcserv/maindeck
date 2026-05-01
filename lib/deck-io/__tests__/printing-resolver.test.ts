import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    printing: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { resolvePrintings } from "../printing-resolver";

const mockFindMany = vi.mocked(prisma.printing.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePrintings", () => {
  it("returns empty when no requests", async () => {
    const out = await resolvePrintings([]);
    expect(out).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("matches by (cardId, lowercased setCode, collectorNumber)", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "lea",
        collectorNumber: "100",
        finishes: ["nonfoil"],
      },
    ] as never);

    const [pin] = await resolvePrintings([
      {
        cardId: 1,
        setCode: "LEA",
        collectorNumber: "100",
        isFoil: false,
        displayName: "Lightning Bolt",
      },
    ]);

    expect(pin).toEqual({ printingId: 99, isFoil: false, warning: null });
  });

  it("downgrades isFoil and warns when foil unavailable", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "lea",
        collectorNumber: "100",
        finishes: ["nonfoil"],
      },
    ] as never);

    const [pin] = await resolvePrintings([
      {
        cardId: 1,
        setCode: "LEA",
        collectorNumber: "100",
        isFoil: true,
        displayName: "Lightning Bolt",
      },
    ]);

    expect(pin?.printingId).toBe(99);
    expect(pin?.isFoil).toBe(false);
    expect(pin?.warning).toContain("not available in foil");
  });

  it("preserves isFoil when finish is supported", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "lea",
        collectorNumber: "100",
        finishes: ["nonfoil", "foil"],
      },
    ] as never);

    const [pin] = await resolvePrintings([
      {
        cardId: 1,
        setCode: "LEA",
        collectorNumber: "100",
        isFoil: true,
        displayName: "Lightning Bolt",
      },
    ]);

    expect(pin).toEqual({ printingId: 99, isFoil: true, warning: null });
  });

  it("returns null printingId when no row matches", async () => {
    mockFindMany.mockResolvedValueOnce([] as never);

    const [pin] = await resolvePrintings([
      {
        cardId: 1,
        setCode: "LEA",
        collectorNumber: "100",
        isFoil: false,
        displayName: "Lightning Bolt",
      },
    ]);

    expect(pin).toEqual({ printingId: null, isFoil: false, warning: null });
  });
});
