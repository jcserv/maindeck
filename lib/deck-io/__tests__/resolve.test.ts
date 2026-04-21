import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";
import type { ParsedCard } from "../parse";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
    },
    printing: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { resolveCards } from "../resolve";

const mockFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);

function parsed(name: string, overrides: Partial<ParsedCard> = {}): ParsedCard {
  return {
    name,
    quantity: 1,
    isFoil: false,
    zone: Zone.MAINBOARD,
    category: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrintingFindMany.mockResolvedValue([] as never);
});

describe("resolveCards", () => {
  it("returns exact matches case-insensitively", async () => {
    // First call: exact lookup returns the canonical name.
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveCards([parsed("lightning bolt")]);

    expect(result.resolved).toEqual([
      expect.objectContaining({
        cardId: 1,
        matchedName: "Lightning Bolt",
        fuzzy: false,
      }),
    ]);
    expect(result.unmatched).toEqual([]);
    // Only the exact-match query runs when every name matches exactly.
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("prefers exact match over fuzzy when both would be available", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 7, name: "Counterspell" },
    ] as never);

    const result = await resolveCards([parsed("Counterspell")]);

    expect(result.resolved[0]).toMatchObject({
      cardId: 7,
      fuzzy: false,
    });
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("falls back to prefix fuzzy match when no exact hit", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never) // exact
      .mockResolvedValueOnce([
        { id: 42, name: "Lightning Helix" },
      ] as never); // fuzzy

    const result = await resolveCards([parsed("Lightnin")]);

    expect(result.resolved[0]).toMatchObject({
      cardId: 42,
      matchedName: "Lightning Helix",
      fuzzy: true,
    });
    expect(result.unmatched).toEqual([]);
  });

  it("picks the closest-length candidate among multiple fuzzy hits", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never) // exact
      .mockResolvedValueOnce([
        { id: 10, name: "Shockwave Totem Of The Ancients" },
        { id: 11, name: "Shock" },
        { id: 12, name: "Shockwave" },
      ] as never);

    const result = await resolveCards([parsed("Shockwav")]);

    // "Shockwave" (length 9) is closer to target "Shockwav" (length 8) than "Shock" (5)
    // or "Shockwave Totem Of The Ancients" (30).
    expect(result.resolved[0]).toMatchObject({
      cardId: 12,
      matchedName: "Shockwave",
      fuzzy: true,
    });
  });

  it("returns parsed name in unmatched for truly unknown cards", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never) // exact
      .mockResolvedValueOnce([] as never); // fuzzy

    const card = parsed("Nonexistent Card Name");
    const result = await resolveCards([card]);

    expect(result.resolved[0]).toMatchObject({
      cardId: null,
      matchedName: null,
      fuzzy: false,
    });
    expect(result.unmatched).toEqual([card]);
  });

  it("treats names as a set when deduplicating lookups", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveCards([
      parsed("Lightning Bolt"),
      parsed("LIGHTNING BOLT"),
      parsed("lightning bolt"),
    ]);

    expect(result.resolved).toHaveLength(3);
    for (const r of result.resolved) {
      expect(r.cardId).toBe(1);
      expect(r.matchedName).toBe("Lightning Bolt");
    }
    // Only one exact-lookup call covers all three rows.
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("returns warnings: [] for clean inputs", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveCards([parsed("Lightning Bolt")]);

    expect(result.warnings).toEqual([]);
  });
});

describe("resolveCards — printing lookup", () => {
  it("attaches printingId when Printing row exists", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Earthbender Ascension" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "tla",
        collectorNumber: "175",
        finishes: ["foil", "nonfoil"],
      },
    ] as never);

    const result = await resolveCards([
      parsed("Earthbender Ascension", { set: "TLA", collectorNumber: "175" }),
    ]);

    expect(result.resolved[0]).toMatchObject({
      cardId: 1,
      printingId: 99,
    });
  });

  it("leaves printingId null when no set/collector on parsed input", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveCards([parsed("Lightning Bolt")]);

    expect(result.resolved[0]).toMatchObject({
      cardId: 1,
      printingId: null,
    });
    // Empty lookup batch should skip the printing query entirely.
    expect(mockPrintingFindMany).not.toHaveBeenCalled();
  });

  it("leaves printingId null when Printing row is missing", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([] as never);

    const result = await resolveCards([
      parsed("Sol Ring", { set: "C21", collectorNumber: "263" }),
    ]);

    expect(result.resolved[0]).toMatchObject({
      cardId: 1,
      printingId: null,
    });
  });

  it("normalizes set code casing in lookup (lowercases parsed set)", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "c21",
        collectorNumber: "263",
        finishes: ["nonfoil"],
      },
    ] as never);

    await resolveCards([
      parsed("Sol Ring", { set: "C21", collectorNumber: "263" }),
    ]);

    const callArgs = mockPrintingFindMany.mock.calls[0]![0] as {
      where: { OR: Array<{ cardId: number; setCode: string; collectorNumber: string }> };
    };
    expect(callArgs.where.OR).toEqual([
      { cardId: 1, setCode: "c21", collectorNumber: "263" },
    ]);
  });

  it("keeps isFoil: true when printing.finishes includes 'foil'", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Earthbender Ascension" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "tla",
        collectorNumber: "175",
        finishes: ["foil", "nonfoil"],
      },
    ] as never);

    const result = await resolveCards([
      parsed("Earthbender Ascension", {
        set: "TLA",
        collectorNumber: "175",
        isFoil: true,
      }),
    ]);

    expect(result.resolved[0]!.isFoil).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("drops isFoil to false + warns when printing is non-foil-only", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "c21",
        collectorNumber: "263",
        finishes: ["nonfoil"],
      },
    ] as never);

    const result = await resolveCards([
      parsed("Sol Ring", {
        set: "C21",
        collectorNumber: "263",
        isFoil: true,
      }),
    ]);

    expect(result.resolved[0]!.isFoil).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Sol Ring");
  });

  it("batches printing lookup into a single query", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
      { id: 2, name: "Counterspell" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([] as never);

    await resolveCards([
      parsed("Sol Ring", { set: "C21", collectorNumber: "263" }),
      parsed("Counterspell", { set: "MH2", collectorNumber: "267" }),
    ]);

    expect(mockPrintingFindMany).toHaveBeenCalledTimes(1);
  });
});
