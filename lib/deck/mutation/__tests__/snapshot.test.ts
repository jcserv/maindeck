import { beforeEach, describe, expect, it, vi } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
    card: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { loadSnapshotForDeck } from "../snapshot";

const mockFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCardFindMany = vi.mocked(prisma.card.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  mockCardFindMany.mockResolvedValue([] as never);
});

describe("loadSnapshotForDeck", () => {
  it("throws when the deck is not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null as never);
    await expect(loadSnapshotForDeck("missing")).rejects.toThrow(
      "Deck not found",
    );
  });

  it("returns a snapshot built from the deck's existing cards", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "deck-1",
      format: Format.MODERN,
      cards: [
        {
          id: "dc-1",
          cardId: 1,
          quantity: 4,
          zone: Zone.MAINBOARD,
          category: null,
          printingId: null,
          isFoil: false,
          card: {
            name: "Lightning Bolt",
            typeLine: "Instant",
            colorIdentity: ["R"],
            legalities: { modern: "legal" },
          },
        },
      ],
      categories: [{ name: "Burn" }],
    } as never);

    const snap = await loadSnapshotForDeck("deck-1");
    expect(snap.deckId).toBe("deck-1");
    expect(snap.format).toBe(Format.MODERN);
    expect(snap.cards).toHaveLength(1);
    expect(snap.cards[0]).toMatchObject({
      cardName: "Lightning Bolt",
      quantity: 4,
    });
    expect(snap.categoryNames).toEqual(["Burn"]);
    expect(snap.cardMeta.get(1)).toMatchObject({ name: "Lightning Bolt" });
  });

  it("loads extra metadata for cards introduced by add changes", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "deck-1",
      format: Format.MODERN,
      cards: [],
      categories: [],
    } as never);
    mockCardFindMany.mockResolvedValueOnce([
      {
        id: 42,
        name: "Counterspell",
        typeLine: "Instant",
        colorIdentity: ["U"],
        legalities: { modern: "legal" },
      },
    ] as never);

    const snap = await loadSnapshotForDeck("deck-1", [
      {
        op: "add",
        cardId: 42,
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);

    expect(mockCardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [42] } },
      }),
    );
    expect(snap.cardMeta.get(42)).toMatchObject({
      name: "Counterspell",
      colorIdentity: ["U"],
    });
  });

  it("does not query extra metadata when add cards already exist on the deck", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "deck-1",
      format: Format.MODERN,
      cards: [
        {
          id: "dc-1",
          cardId: 7,
          quantity: 1,
          zone: Zone.MAINBOARD,
          category: null,
          printingId: null,
          isFoil: false,
          card: {
            name: "Sol Ring",
            typeLine: "Artifact",
            colorIdentity: [],
            legalities: { commander: "legal" },
          },
        },
      ],
      categories: [],
    } as never);

    await loadSnapshotForDeck("deck-1", [
      {
        op: "add",
        cardId: 7,
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);

    expect(mockCardFindMany).not.toHaveBeenCalled();
  });

  it("defaults legalities to {} when null on a deck card", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "deck-1",
      format: Format.MODERN,
      cards: [
        {
          id: "dc-1",
          cardId: 1,
          quantity: 1,
          zone: Zone.MAINBOARD,
          category: null,
          printingId: null,
          isFoil: false,
          card: {
            name: "Mystery",
            typeLine: null,
            colorIdentity: [],
            legalities: null,
          },
        },
      ],
      categories: [],
    } as never);

    const snap = await loadSnapshotForDeck("deck-1");
    expect(snap.cards[0]!.legalities).toEqual({});
    expect(snap.cardMeta.get(1)?.legalities).toEqual({});
  });

  it("defaults extra-card legalities to {} when null", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "deck-1",
      format: Format.MODERN,
      cards: [],
      categories: [],
    } as never);
    mockCardFindMany.mockResolvedValueOnce([
      {
        id: 99,
        name: "Mystery Add",
        typeLine: null,
        colorIdentity: [],
        legalities: null,
      },
    ] as never);

    const snap = await loadSnapshotForDeck("deck-1", [
      {
        op: "add",
        cardId: 99,
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
    expect(snap.cardMeta.get(99)?.legalities).toEqual({});
  });
});
