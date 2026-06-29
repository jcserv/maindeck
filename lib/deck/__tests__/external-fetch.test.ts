import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("../external/index", () => ({
  getSourceForUrl: vi.fn(),
  ExternalFetchError: class ExternalFetchError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ExternalFetchError";
    }
  },
}));
vi.mock("../io/parse", () => ({
  parseDecklist: vi.fn(),
  detectFormat: vi.fn(),
}));
vi.mock("../io/card-resolver", () => ({
  resolveCardNames: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getSourceForUrl } from "../external/index";
import { parseDecklist, detectFormat } from "../io/parse";
import { resolveCardNames } from "../io/card-resolver";
import { fetchExternalComparableDeck, buildComparableDeckFromText } from "../external-fetch";

const mockGetSourceForUrl = vi.mocked(getSourceForUrl);
const mockParseDecklist = vi.mocked(parseDecklist);
const mockDetectFormat = vi.mocked(detectFormat);
const mockResolveCardNames = vi.mocked(resolveCardNames);
const mockFindMany = vi.mocked(prisma.card.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── fetchExternalComparableDeck ──────────────────────────────────────────────

describe("fetchExternalComparableDeck", () => {
  it("404s when no source matches the URL", async () => {
    mockGetSourceForUrl.mockReturnValue(null);

    await expect(fetchExternalComparableDeck("https://unknown.com/decks/1")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("resolves entries to cards and returns a ComparableDeck", async () => {
    const mockAdapter = {
      id: "archidekt" as const,
      detect: vi.fn(),
      fetch: vi.fn().mockResolvedValue({
        name: "Test Deck",
        format: "COMMANDER",
        entries: [{ name: "Sol Ring", quantity: 1, zone: "MAINBOARD" }],
      }),
    };
    mockGetSourceForUrl.mockReturnValue(mockAdapter as never);

    const dbCard = {
      id: 42,
      name: "Sol Ring",
      mainType: "Artifact" as never,
      typeLine: "Artifact",
      oracleText: "{T}: Add {C}{C}.",
      manaCost: "{1}",
      cmc: 1,
      colors: [],
    };
    mockFindMany.mockResolvedValue([dbCard] as never);

    const result = await fetchExternalComparableDeck("https://archidekt.com/decks/123");

    expect(result.id).toBe("https://archidekt.com/decks/123");
    expect(result.name).toBe("Test Deck");
    expect(result.format).toBe("COMMANDER");
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]!.cardId).toBe(42);
    expect(result.cards[0]!.card.name).toBe("Sol Ring");
    expect(result.cards[0]!.zone).toBe("MAINBOARD");
  });

  it("skips entries whose card is not found in the database", async () => {
    const mockAdapter = {
      id: "archidekt" as const,
      detect: vi.fn(),
      fetch: vi.fn().mockResolvedValue({
        name: "Test Deck",
        format: "COMMANDER",
        entries: [
          { name: "Unknown Card", quantity: 1, zone: "MAINBOARD" },
          { name: "Sol Ring", quantity: 1, zone: "MAINBOARD" },
        ],
      }),
    };
    mockGetSourceForUrl.mockReturnValue(mockAdapter as never);

    mockFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Sol Ring",
        mainType: "Artifact" as never,
        typeLine: "Artifact",
        oracleText: "",
        manaCost: "{1}",
        cmc: 1,
        colors: [],
      },
    ] as never);

    const result = await fetchExternalComparableDeck("https://archidekt.com/decks/123");

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]!.card.name).toBe("Sol Ring");
  });
});

// ─── buildComparableDeckFromText ──────────────────────────────────────────────

describe("buildComparableDeckFromText", () => {
  const solRingCard = {
    id: 1,
    name: "Sol Ring",
    mainType: "Artifact" as never,
    typeLine: "Artifact",
    oracleText: "",
    manaCost: "{1}",
    cmc: 1,
    colors: [],
  };

  const parsedCard = {
    name: "Sol Ring",
    quantity: 1,
    isFoil: false,
    zone: "MAINBOARD" as never,
    category: null,
  };

  const resolvedCard = {
    parsed: parsedCard,
    cardId: 1,
    matchedName: "Sol Ring",
    match: { kind: "exact" as const },
    warnings: [],
  };

  beforeEach(() => {
    mockDetectFormat.mockReturnValue("text" as never);
    mockParseDecklist.mockReturnValue({
      format: "text" as never,
      cards: [parsedCard],
      unmatchedLines: [],
      warnings: [],
    });
    mockResolveCardNames.mockResolvedValue([resolvedCard] as never);
    mockFindMany.mockResolvedValue([solRingCard] as never);
  });

  it("builds a ComparableDeck from parsed text", async () => {
    const result = await buildComparableDeckFromText("1 Sol Ring");

    expect(result.id).toBe("text-import");
    expect(result.format).toBe("COMMANDER");
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]!.cardId).toBe(1);
    expect(result.cards[0]!.card.name).toBe("Sol Ring");
  });

  it("extracts deck name from a leading // comment", async () => {
    const result = await buildComparableDeckFromText("// My Custom Deck\n1 Sol Ring");

    expect(result.name).toBe("My Custom Deck");
  });

  it("ignores // comments that start with reserved keywords (deck, sideboard, etc.)", async () => {
    const result = await buildComparableDeckFromText("// Deck\n// Sideboard\n1 Sol Ring");

    expect(result.name).toBe("Pasted decklist");
  });

  it("falls back to 'Pasted decklist' when no valid name comment exists", async () => {
    const result = await buildComparableDeckFromText("1 Sol Ring");

    expect(result.name).toBe("Pasted decklist");
  });

  it("skips resolved cards with null cardId", async () => {
    mockResolveCardNames.mockResolvedValue([
      { ...resolvedCard, cardId: null, matchedName: null, match: { kind: "none" as const } },
      resolvedCard,
    ] as never);

    const result = await buildComparableDeckFromText("1 Unknown\n1 Sol Ring");

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]!.card.name).toBe("Sol Ring");
  });

  it("skips cards not found in the database after id lookup", async () => {
    mockFindMany.mockResolvedValue([] as never);

    const result = await buildComparableDeckFromText("1 Sol Ring");

    expect(result.cards).toHaveLength(0);
  });
});
