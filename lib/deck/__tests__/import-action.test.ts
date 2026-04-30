import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    deckCard: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    deckRevision: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    card: {
      findMany: vi.fn(),
    },
    printing: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Format, Visibility, Zone } from "@/lib/generated/prisma/client";
import { createDeckWithImport, importDeck } from "../import-action";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckCreate = vi.mocked(prisma.deck.create);
const mockDeckCardFindFirst = vi.mocked(prisma.deckCard.findFirst);
const mockDeckCardCreate = vi.mocked(prisma.deckCard.create);
const mockDeckCardUpdate = vi.mocked(prisma.deckCard.update);
const mockDeckCardDelete = vi.mocked(prisma.deckCard.delete);
const mockDeckRevisionFindFirst = vi.mocked(prisma.deckRevision.findFirst);
const mockDeckRevisionCreate = vi.mocked(prisma.deckRevision.create);
const mockDeckRevisionUpdate = vi.mocked(prisma.deckRevision.update);
const mockDeckRevisionDelete = vi.mocked(prisma.deckRevision.delete);
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const DECK_ID = "deck-1";
const NEW_DECK_ID = "deck-new";

function snapshotDeck(overrides: Record<string, unknown> = {}) {
  // MODERN format keeps invariant gates permissive (no singleton, no color-identity).
  return {
    id: DECK_ID,
    userId: USER_ID,
    format: Format.MODERN,
    cards: [],
    categories: [],
    ...overrides,
  };
}

function txPassthrough() {
  mockTransaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") {
      const tx = {
        deckCard: {
          findFirst: mockDeckCardFindFirst,
          create: mockDeckCardCreate,
          update: mockDeckCardUpdate,
          delete: mockDeckCardDelete,
        },
        deckRevision: {
          findFirst: mockDeckRevisionFindFirst,
          create: mockDeckRevisionCreate,
          update: mockDeckRevisionUpdate,
          delete: mockDeckRevisionDelete,
        },
      };
      return fn(tx);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue(snapshotDeck() as never);
  mockDeckCardFindFirst.mockResolvedValue(null);
  mockDeckCardCreate.mockResolvedValue({} as never);
  mockDeckCardUpdate.mockResolvedValue({} as never);
  mockDeckCardDelete.mockResolvedValue({} as never);
  mockDeckRevisionFindFirst.mockResolvedValue(null);
  mockDeckRevisionCreate.mockResolvedValue({} as never);
  mockDeckRevisionUpdate.mockResolvedValue({} as never);
  mockDeckRevisionDelete.mockResolvedValue({} as never);
  mockPrintingFindMany.mockResolvedValue([] as never);
  // Default response for loadSnapshot's "fetch missing card meta" call;
  // resolveCards' own card.findMany calls are queued via mockResolvedValueOnce.
  mockCardFindMany.mockResolvedValue([] as never);
  txPassthrough();
});

// ---------------------------------------------------------------------------
// importDeck
// ---------------------------------------------------------------------------

describe("importDeck", () => {
  it("404s for non-owners", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(importDeck(DECK_ID, "1 Lightning Bolt")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns structured matched/unmatched counts with names listed", async () => {
    mockCardFindMany
      .mockResolvedValueOnce([{ id: 1, name: "Lightning Bolt" }] as never) // exact
      .mockResolvedValueOnce([] as never); // fuzzy for "Made Up Card"

    const result = await importDeck(
      DECK_ID,
      "1 Lightning Bolt\n1 Made Up Card",
    );

    expect(result.added).toBe(1);
    expect(result.unmatchedCount).toBe(1);
    expect(result.unmatchedNames).toEqual(["Made Up Card"]);
  });

  it("routes cards into the correct zone based on section markers", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
      { id: 2, name: "Counterspell" },
      { id: 3, name: "Sol Ring" },
    ] as never);

    await importDeck(
      DECK_ID,
      [
        "Mainboard",
        "1 Lightning Bolt",
        "Sideboard",
        "1 Counterspell",
        "Commander",
        "1 Sol Ring",
      ].join("\n"),
    );

    const zonesCreated = mockDeckCardCreate.mock.calls.map(
      ([arg]) => (arg as { data: { cardId: number; zone: Zone } }).data,
    );
    expect(zonesCreated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 1, zone: Zone.MAINBOARD }),
        expect.objectContaining({ cardId: 2, zone: Zone.SIDEBOARD }),
        expect.objectContaining({ cardId: 3, zone: Zone.COMMANDER }),
      ]),
    );
  });

  it("aggregates duplicate card lines in the same section into a single row", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    // First line creates a new row; second finds the just-created row and increments.
    mockDeckCardFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dc-1" } as never);

    await importDeck(DECK_ID, "2 Lightning Bolt\n1 Lightning Bolt");

    expect(mockDeckCardCreate).toHaveBeenCalledTimes(1);
    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ cardId: 1, quantity: 2 }),
    });
    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-1" },
      data: { quantity: { increment: 1 } },
    });
  });

  it("increments existing rows rather than creating duplicates", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    mockDeckCardFindFirst.mockResolvedValueOnce({ id: "dc-existing" } as never);

    await importDeck(DECK_ID, "2 Lightning Bolt");

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-existing" },
      data: { quantity: { increment: 2 } },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("writes cards inside a single $transaction and busts the deck tag", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    await importDeck(DECK_ID, "1 Lightning Bolt");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("rejects import text over the DoS ceiling", async () => {
    await expect(importDeck(DECK_ID, "x".repeat(100_001))).rejects.toThrow();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("persists printingId and isFoil on create", async () => {
    mockCardFindMany.mockResolvedValueOnce([
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

    await importDeck(DECK_ID, "1 Earthbender Ascension (TLA) 175 *F*");

    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cardId: 1,
        printingId: 99,
        isFoil: true,
      }),
    });
  });

  it("dedupe treats different printings as separate rows", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 50,
        cardId: 1,
        setCode: "c21",
        collectorNumber: "263",
        finishes: ["nonfoil"],
      },
      {
        id: 60,
        cardId: 1,
        setCode: "cmr",
        collectorNumber: "472",
        finishes: ["nonfoil"],
      },
    ] as never);
    mockDeckCardFindFirst.mockResolvedValue(null);

    await importDeck(
      DECK_ID,
      ["1 Sol Ring (C21) 263", "1 Sol Ring (CMR) 472"].join("\n"),
    );

    expect(mockDeckCardCreate).toHaveBeenCalledTimes(2);
    const created = mockDeckCardCreate.mock.calls.map(
      ([arg]) => (arg as { data: { printingId: number | null } }).data,
    );
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ printingId: 50 }),
        expect.objectContaining({ printingId: 60 }),
      ]),
    );
  });

  it("dedupe treats foil and nonfoil of same printing as separate rows", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 50,
        cardId: 1,
        setCode: "c21",
        collectorNumber: "263",
        finishes: ["foil", "nonfoil"],
      },
    ] as never);
    mockDeckCardFindFirst.mockResolvedValue(null);

    await importDeck(
      DECK_ID,
      ["1 Sol Ring (C21) 263", "1 Sol Ring (C21) 263 *F*"].join("\n"),
    );

    expect(mockDeckCardCreate).toHaveBeenCalledTimes(2);
    const created = mockDeckCardCreate.mock.calls.map(
      ([arg]) =>
        (arg as { data: { printingId: number | null; isFoil: boolean } }).data,
    );
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ printingId: 50, isFoil: false }),
        expect.objectContaining({ printingId: 50, isFoil: true }),
      ]),
    );
  });

  it("merges quantity when same (cardId, printingId, isFoil)", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 50,
        cardId: 1,
        setCode: "c21",
        collectorNumber: "263",
        finishes: ["nonfoil"],
      },
    ] as never);
    mockDeckCardFindFirst.mockResolvedValueOnce({ id: "dc-existing" } as never);

    await importDeck(DECK_ID, "2 Sol Ring (C21) 263");

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-existing" },
      data: { quantity: { increment: 2 } },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();

    const findFirstArgs = mockDeckCardFindFirst.mock.calls[0]![0] as {
      where: { printingId: number | null; isFoil: boolean };
    };
    expect(findFirstArgs.where.printingId).toBe(50);
    expect(findFirstArgs.where.isFoil).toBe(false);
  });

  it("surfaces a warning when lines look like cards but fail to parse", async () => {
    mockCardFindMany.mockResolvedValueOnce([] as never);

    const result = await importDeck(DECK_ID, "0 Broken Line");

    expect(result.warnings.some((w) => w.includes("could not be parsed"))).toBe(
      true,
    );
  });

  it("passes resolver warnings through in importDeck return value", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 50,
        cardId: 1,
        setCode: "c21",
        collectorNumber: "263",
        finishes: ["nonfoil"],
      },
    ] as never);

    const result = await importDeck(DECK_ID, "1 Sol Ring (C21) 263 *F*");

    expect(result.warnings.some((w) => w.includes("Sol Ring"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createDeckWithImport
// ---------------------------------------------------------------------------

describe("createDeckWithImport", () => {
  it("creates the deck and bulk-inserts imported cards in one round-trip", async () => {
    mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const id = await createDeckWithImport({
      name: "Burn",
      format: Format.MODERN,
      visibility: Visibility.PUBLIC,
      importText: "4 Lightning Bolt",
    });

    expect(id).toBe(NEW_DECK_ID);
    expect(mockDeckCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        name: "Burn",
        format: Format.MODERN,
        visibility: Visibility.PUBLIC,
        description: null,
      },
    });
    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deckId: NEW_DECK_ID,
        cardId: 1,
        quantity: 4,
        zone: Zone.MAINBOARD,
      }),
    });
  });

  it("invalidates both deck-list and the new deck's tag", async () => {
    mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
    mockCardFindMany.mockResolvedValueOnce([] as never);
    mockCardFindMany.mockResolvedValueOnce([] as never);

    await createDeckWithImport({
      name: "Empty",
      importText: "",
    });

    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${NEW_DECK_ID}`);
  });

  it("still creates the deck when the import yields no matched cards", async () => {
    mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
    mockCardFindMany
      .mockResolvedValueOnce([] as never) // exact
      .mockResolvedValueOnce([] as never); // fuzzy

    const id = await createDeckWithImport({
      name: "Test",
      importText: "1 Completely Fake Card",
    });

    expect(id).toBe(NEW_DECK_ID);
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });

  it("rejects when the name is empty", async () => {
    await expect(
      createDeckWithImport({ name: "   ", importText: "" }),
    ).rejects.toThrow();
    expect(mockDeckCreate).not.toHaveBeenCalled();
  });

  it("rejects import text over the DoS ceiling", async () => {
    await expect(
      createDeckWithImport({ name: "Deck", importText: "x".repeat(100_001) }),
    ).rejects.toThrow();
    expect(mockDeckCreate).not.toHaveBeenCalled();
  });

  it("applies the same printingId + isFoil behavior", async () => {
    mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
    mockCardFindMany.mockResolvedValueOnce([
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

    await createDeckWithImport({
      name: "Avatar deck",
      importText: "1 Earthbender Ascension (TLA) 175 *F*",
    });

    expect(mockDeckCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deckId: NEW_DECK_ID,
        cardId: 1,
        printingId: 99,
        isFoil: true,
      }),
    });
  });

  it("increments an existing row rather than creating a duplicate", async () => {
    mockDeckCreate.mockResolvedValue({ id: NEW_DECK_ID } as never);
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    mockDeckCardFindFirst.mockResolvedValueOnce({ id: "dc-existing" } as never);

    await createDeckWithImport({
      name: "Burn",
      importText: "3 Lightning Bolt",
    });

    expect(mockDeckCardUpdate).toHaveBeenCalledWith({
      where: { id: "dc-existing" },
      data: { quantity: { increment: 3 } },
    });
    expect(mockDeckCardCreate).not.toHaveBeenCalled();
  });
});
