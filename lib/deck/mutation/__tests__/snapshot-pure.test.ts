import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { snapshotFromCards, snapshotFromDeck } from "../snapshot-pure";
import type { Deck } from "@/lib/deck/zone-view";
import type { SnapshotCard } from "../types";

function makeDeckCard(
  overrides: Partial<{
    id: string;
    cardId: number;
    quantity: number;
    zone: Zone;
    category: string | null;
    printingId: number | null;
    isFoil: boolean;
    cardName: string;
    typeLine: string | null;
    colorIdentity: string[];
    legalities: Record<string, string> | null;
  }> = {},
) {
  const {
    id = "dc-1",
    cardId = 1,
    quantity = 1,
    zone = Zone.MAINBOARD,
    category = null,
    printingId = null,
    isFoil = false,
    cardName = "Lightning Bolt",
    typeLine = "Instant",
    colorIdentity = ["R"],
    legalities = { modern: "legal" },
  } = overrides;
  return {
    id,
    cardId,
    quantity,
    zone,
    category,
    printingId,
    isFoil,
    card: { name: cardName, typeLine, colorIdentity, legalities },
  };
}

function makeDeck(overrides: Record<string, unknown> = {}): Deck {
  return {
    id: "deck-1",
    format: Format.MODERN,
    cards: [],
    categories: [],
    ...overrides,
  } as unknown as Deck;
}

describe("snapshotFromDeck", () => {
  it("maps deck cards into SnapshotCards", () => {
    const deck = makeDeck({
      cards: [makeDeckCard({ id: "dc-1", cardId: 1 })],
    });
    const snap = snapshotFromDeck(deck);
    expect(snap.cards).toHaveLength(1);
    expect(snap.cards[0]).toMatchObject({
      id: "dc-1",
      cardId: 1,
      cardName: "Lightning Bolt",
      typeLine: "Instant",
      colorIdentity: ["R"],
    });
  });

  it("populates cardMeta keyed by cardId", () => {
    const deck = makeDeck({
      cards: [makeDeckCard({ cardId: 7, cardName: "Sol Ring" })],
    });
    const snap = snapshotFromDeck(deck);
    expect(snap.cardMeta.get(7)).toMatchObject({ name: "Sol Ring" });
  });

  it("falls back to empty array when deck.categories is undefined", () => {
    const deck = makeDeck({ categories: undefined as unknown as Deck["categories"] });
    const snap = snapshotFromDeck(deck);
    expect(snap.categoryNames).toEqual([]);
  });

  it("uses provided category names when present", () => {
    const deck = makeDeck({
      categories: [
        { name: "Ramp", sortOrder: 0 },
        { name: "Removal", sortOrder: 1 },
      ] as unknown as Deck["categories"],
    });
    const snap = snapshotFromDeck(deck);
    expect(snap.categoryNames).toEqual(["Ramp", "Removal"]);
  });

  it("defaults missing card metadata to safe values", () => {
    const deck = makeDeck({
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
            // intentionally missing colorIdentity + legalities to exercise `??`
          },
        },
      ] as unknown as Deck["cards"],
    });
    const snap = snapshotFromDeck(deck);
    expect(snap.cards[0]!.typeLine).toBeNull();
    expect(snap.cards[0]!.colorIdentity).toEqual([]);
    expect(snap.cards[0]!.legalities).toEqual({});
  });
});

describe("snapshotFromCards", () => {
  function snapshotCard(overrides: Partial<SnapshotCard> = {}): SnapshotCard {
    return {
      id: "dc-1",
      cardId: 1,
      cardName: "Forest",
      zone: Zone.MAINBOARD,
      category: null,
      quantity: 1,
      typeLine: "Basic Land — Forest",
      colorIdentity: ["G"],
      legalities: {},
      printingId: null,
      isFoil: false,
      ...overrides,
    };
  }

  it("returns deckId 'snapshot' by default", () => {
    const snap = snapshotFromCards({ format: Format.COMMANDER, cards: [] });
    expect(snap.deckId).toBe("snapshot");
  });

  it("uses provided deckId when given", () => {
    const snap = snapshotFromCards({
      deckId: "explicit-id",
      format: Format.COMMANDER,
      cards: [],
    });
    expect(snap.deckId).toBe("explicit-id");
  });

  it("merges extraMeta into cardMeta map (with default empty colorIdentity/legalities)", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [snapshotCard({ cardId: 1 })],
      extraMeta: [
        { cardId: 99, name: "Mystery Card", typeLine: "Sorcery" },
      ],
    });
    expect(snap.cardMeta.get(99)).toMatchObject({
      name: "Mystery Card",
      typeLine: "Sorcery",
      colorIdentity: [],
      legalities: {},
    });
  });

  it("respects extraMeta colorIdentity/legalities when provided", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [],
      extraMeta: [
        {
          cardId: 99,
          name: "Counterspell",
          typeLine: "Instant",
          colorIdentity: ["U"],
          legalities: { commander: "legal" },
        },
      ],
    });
    expect(snap.cardMeta.get(99)).toMatchObject({
      colorIdentity: ["U"],
      legalities: { commander: "legal" },
    });
  });

  it("uses provided categoryNames", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [],
      categoryNames: ["Ramp"],
    });
    expect(snap.categoryNames).toEqual(["Ramp"]);
  });
});
