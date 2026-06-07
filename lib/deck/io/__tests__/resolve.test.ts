import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";
import type { ParsedCard, ParsedDecklist } from "../parse";

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
import { resolveDecklist } from "../resolve";

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

function decklist(cards: ParsedCard[]): ParsedDecklist {
  return {
    format: "text",
    cards,
    unmatchedLines: [],
    warnings: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrintingFindMany.mockResolvedValue([] as never);
});

describe("resolveDecklist", () => {
  it("returns exact matches case-insensitively", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveDecklist(decklist([parsed("lightning bolt")]));

    expect(result.cards).toEqual([
      expect.objectContaining({
        cardId: 1,
        matchedName: "Lightning Bolt",
        match: { kind: "exact" },
      }),
    ]);
    expect(result.unmatched).toEqual([]);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("prefers exact match over fuzzy when both would be available", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 7, name: "Counterspell" },
    ] as never);

    const result = await resolveDecklist(decklist([parsed("Counterspell")]));

    expect(result.cards[0]).toMatchObject({
      cardId: 7,
      match: { kind: "exact" },
    });
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("falls back to prefix fuzzy match when no exact hit and confidence is high enough", async () => {
    // "Shockwav" (8) → "Shockwave" (9): confidence=0.875 ≥ 0.7
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 42, name: "Shockwave" },
      ] as never);

    const result = await resolveDecklist(decklist([parsed("Shockwav")]));

    expect(result.cards[0]).toMatchObject({
      cardId: 42,
      matchedName: "Shockwave",
    });
    expect(result.cards[0]!.match.kind).toBe("fuzzy");
    expect(result.unmatched).toEqual([]);
    expect(result.warnings).toContain(
      '"Shockwav" was not found; substituted "Shockwave" (fuzzy match)',
    );
  });

  it("rejects low-confidence fuzzy matches as unmatched", async () => {
    // "Lightnin" (8) → "Lightning Helix" (15): confidence=0.125 < 0.7
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 42, name: "Lightning Helix" },
      ] as never);

    const result = await resolveDecklist(decklist([parsed("Lightnin")]));

    expect(result.cards[0]).toMatchObject({
      cardId: null,
      match: { kind: "none" },
    });
    expect(result.unmatched).toHaveLength(1);
  });

  it("picks the closest-length candidate among multiple fuzzy hits", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 10, name: "Shockwave Totem Of The Ancients" },
        { id: 11, name: "Shock" },
        { id: 12, name: "Shockwave" },
      ] as never);

    const result = await resolveDecklist(decklist([parsed("Shockwav")]));

    expect(result.cards[0]).toMatchObject({
      cardId: 12,
      matchedName: "Shockwave",
    });
    expect(result.cards[0]!.match.kind).toBe("fuzzy");
  });

  it("returns parsed name in unmatched for truly unknown cards", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const card = parsed("Nonexistent Card Name");
    const result = await resolveDecklist(decklist([card]));

    expect(result.cards[0]).toMatchObject({
      cardId: null,
      matchedName: null,
      match: { kind: "none" },
    });
    expect(result.unmatched).toEqual([card]);
  });

  it("treats names as a set when deduplicating lookups", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveDecklist(
      decklist([
        parsed("Lightning Bolt"),
        parsed("LIGHTNING BOLT"),
        parsed("lightning bolt"),
      ]),
    );

    expect(result.cards).toHaveLength(3);
    for (const r of result.cards) {
      expect(r.cardId).toBe(1);
      expect(r.matchedName).toBe("Lightning Bolt");
    }
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("returns warnings: [] for clean inputs", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveDecklist(decklist([parsed("Lightning Bolt")]));

    expect(result.warnings).toEqual([]);
  });

  it("propagates parse warnings into the flat warnings list", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const input: ParsedDecklist = {
      format: "dek",
      cards: [parsed("Lightning Bolt")],
      unmatchedLines: [],
      warnings: ["DEK had a malformed entry"],
    };
    const result = await resolveDecklist(input);

    expect(result.warnings).toContain("DEK had a malformed entry");
  });

  it("summarizes unmatched parse lines as a warning", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const input: ParsedDecklist = {
      format: "text",
      cards: [parsed("Lightning Bolt")],
      unmatchedLines: ["3 ???", "x bad line"],
      warnings: [],
    };
    const result = await resolveDecklist(input);

    expect(result.warnings.some((w) => w.includes("2 line(s)"))).toBe(true);
  });
});

describe("resolveDecklist — printing lookup", () => {
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

    const result = await resolveDecklist(
      decklist([
        parsed("Earthbender Ascension", { set: "TLA", collectorNumber: "175" }),
      ]),
    );

    expect(result.cards[0]).toMatchObject({
      cardId: 1,
      printingId: 99,
    });
  });

  it("leaves printingId null when no set/collector on parsed input", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await resolveDecklist(decklist([parsed("Lightning Bolt")]));

    expect(result.cards[0]).toMatchObject({
      cardId: 1,
      printingId: null,
    });
    expect(mockPrintingFindMany).not.toHaveBeenCalled();
  });

  it("leaves printingId null when Printing row is missing", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([] as never);

    const result = await resolveDecklist(
      decklist([parsed("Sol Ring", { set: "C21", collectorNumber: "263" })]),
    );

    expect(result.cards[0]).toMatchObject({
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

    await resolveDecklist(
      decklist([parsed("Sol Ring", { set: "C21", collectorNumber: "263" })]),
    );

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

    const result = await resolveDecklist(
      decklist([
        parsed("Earthbender Ascension", {
          set: "TLA",
          collectorNumber: "175",
          isFoil: true,
        }),
      ]),
    );

    expect(result.cards[0]!.isFoil).toBe(true);
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

    const result = await resolveDecklist(
      decklist([
        parsed("Sol Ring", {
          set: "C21",
          collectorNumber: "263",
          isFoil: true,
        }),
      ]),
    );

    expect(result.cards[0]!.isFoil).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Sol Ring");
  });

  it("batches printing lookup into a single query", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
      { id: 2, name: "Counterspell" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([] as never);

    await resolveDecklist(
      decklist([
        parsed("Sol Ring", { set: "C21", collectorNumber: "263" }),
        parsed("Counterspell", { set: "MH2", collectorNumber: "267" }),
      ]),
    );

    expect(mockPrintingFindMany).toHaveBeenCalledTimes(1);
  });
});
