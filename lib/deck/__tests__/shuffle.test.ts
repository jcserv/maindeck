import { describe, expect, it } from "vitest";
import type { Card, DeckCard, Zone } from "@/lib/generated/prisma/client";
import type { SerializedPrinting as Printing } from "@/lib/deck/queries";
import { drawHand, expandQuantities, shuffleDeck } from "../shuffle";

function makeCard(overrides: Partial<Card> & { id: number; name: string }): Card {
  return {
    mainType: "Instant",
    typeLine: null,
    oracleText: null,
    manaCost: null,
    cmc: null,
    colors: [],
    colorIdentity: [],
    keywords: [],
    power: null,
    toughness: null,
    games: [],
    legalities: {},
    reserved: false,
    gameChanger: false,
    version: null,
    updatedAt: new Date(),
    ...overrides,
  } as Card;
}

type TestDeckCard = DeckCard & {
  card: Card;
  printing: Printing | null;
  categories: string[];
};

function makeDeckCard(
  overrides: Partial<TestDeckCard> & {
    id: string;
    cardId: number;
    quantity: number;
    zone: Zone;
    card: Card;
  },
): TestDeckCard {
  return {
    deckId: "deck-1",
    printingId: null,
    isFoil: false,
    categories: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    printing: null,
    ...overrides,
  } as TestDeckCard;
}

function makeSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

describe("shuffleDeck", () => {
  it("returns all elements, preserving count", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffleDeck(input, makeSeededRng(42));
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the original array", () => {
    const input = [1, 2, 3];
    const copy = [...input];
    shuffleDeck(input, makeSeededRng(1));
    expect(input).toEqual(copy);
  });

  it("produces a different order with a different seed (statistical sanity)", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = shuffleDeck(input, makeSeededRng(1));
    const b = shuffleDeck(input, makeSeededRng(99999));
    expect(a).not.toEqual(b);
  });

  it("returns empty array for empty input", () => {
    expect(shuffleDeck([], makeSeededRng(1))).toEqual([]);
  });

  it("is deterministic for the same seed", () => {
    const input = [1, 2, 3, 4, 5];
    const first = shuffleDeck(input, makeSeededRng(7));
    const second = shuffleDeck(input, makeSeededRng(7));
    expect(first).toEqual(second);
  });
});

describe("expandQuantities", () => {
  const bolt = makeCard({ id: 1, name: "Lightning Bolt" });
  const island = makeCard({ id: 2, name: "Island" });

  it("expands quantities into flat array", () => {
    const dc = [
      makeDeckCard({ id: "a", cardId: 1, quantity: 4, zone: "MAINBOARD", card: bolt }),
      makeDeckCard({ id: "b", cardId: 2, quantity: 2, zone: "MAINBOARD", card: island }),
    ];
    const result = expandQuantities(dc);
    expect(result).toHaveLength(6);
    expect(result.filter((c) => c.card.name === "Lightning Bolt")).toHaveLength(4);
    expect(result.filter((c) => c.card.name === "Island")).toHaveLength(2);
  });

  it("excludes SIDEBOARD zone", () => {
    const dc = [
      makeDeckCard({ id: "a", cardId: 1, quantity: 4, zone: "MAINBOARD", card: bolt }),
      makeDeckCard({ id: "b", cardId: 2, quantity: 3, zone: "SIDEBOARD", card: island }),
    ];
    const result = expandQuantities(dc);
    expect(result).toHaveLength(4);
    expect(result.every((c) => c.card.name === "Lightning Bolt")).toBe(true);
  });

  it("excludes CONSIDERING zone", () => {
    const dc = [
      makeDeckCard({ id: "a", cardId: 1, quantity: 2, zone: "MAINBOARD", card: bolt }),
      makeDeckCard({ id: "b", cardId: 2, quantity: 5, zone: "CONSIDERING", card: island }),
    ];
    const result = expandQuantities(dc);
    expect(result).toHaveLength(2);
  });

  it("excludes COMMANDER zone (commander starts in command zone, not library)", () => {
    const dc = [
      makeDeckCard({ id: "a", cardId: 1, quantity: 2, zone: "MAINBOARD", card: bolt }),
      makeDeckCard({ id: "b", cardId: 2, quantity: 1, zone: "COMMANDER", card: island }),
    ];
    const result = expandQuantities(dc);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(expandQuantities([])).toEqual([]);
  });

  it("returns empty array when all cards are in excluded zones", () => {
    const dc = [
      makeDeckCard({ id: "a", cardId: 1, quantity: 4, zone: "SIDEBOARD", card: bolt }),
      makeDeckCard({ id: "b", cardId: 2, quantity: 2, zone: "CONSIDERING", card: island }),
    ];
    expect(expandQuantities(dc)).toEqual([]);
  });

  it("preserves category memberships on Mainboard cards", () => {
    const dc = [
      makeDeckCard({
        id: "a",
        cardId: 1,
        quantity: 2,
        zone: "MAINBOARD",
        categories: ["Ramp", "Artifacts"],
        card: bolt,
      }),
    ];
    const result = expandQuantities(dc);
    expect(result).toHaveLength(2);
    expect(result[0]!.categories).toEqual(["Ramp", "Artifacts"]);
  });
});

describe("drawHand", () => {
  const bolt = makeCard({ id: 1, name: "Lightning Bolt" });
  const island = makeCard({ id: 2, name: "Island" });

  const mainDeck: TestDeckCard[] = [
    makeDeckCard({ id: "a", cardId: 1, quantity: 4, zone: "MAINBOARD", card: bolt }),
    makeDeckCard({ id: "b", cardId: 2, quantity: 20, zone: "MAINBOARD", card: island }),
    makeDeckCard({ id: "c", cardId: 1, quantity: 4, zone: "SIDEBOARD", card: bolt }),
  ];

  it("draws default 7 cards", () => {
    const hand = drawHand(mainDeck);
    expect(hand).toHaveLength(7);
  });

  it("draws custom hand size", () => {
    expect(drawHand(mainDeck, 5)).toHaveLength(5);
  });

  it("returns empty hand for empty deck", () => {
    expect(drawHand([])).toEqual([]);
  });

  it("returns all cards when deck is smaller than hand size", () => {
    const small: TestDeckCard[] = [
      makeDeckCard({ id: "a", cardId: 1, quantity: 3, zone: "MAINBOARD", card: bolt }),
    ];
    const hand = drawHand(small, 7);
    expect(hand).toHaveLength(3);
  });

  it("does not include sideboard cards in drawn hand", () => {
    const sideboardOnly: TestDeckCard[] = [
      makeDeckCard({ id: "a", cardId: 1, quantity: 60, zone: "SIDEBOARD", card: bolt }),
    ];
    expect(drawHand(sideboardOnly)).toEqual([]);
  });

  it("drawn hand cards reference original deck card objects", () => {
    const hand = drawHand(mainDeck, 7);
    for (const item of hand) {
      expect(mainDeck).toContain(item);
    }
  });
});
