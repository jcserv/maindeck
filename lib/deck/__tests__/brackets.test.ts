import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import {
  BRACKETS,
  countGameChangers,
  getBracketInfo,
  resolveDeckBracket,
  suggestBracket,
} from "../brackets";
import type { Deck } from "../zone-view";

type MinimalCard = {
  name: string;
  gameChanger: boolean;
};

type MinimalDeckCard = {
  id: string;
  quantity: number;
  zone: Zone;
  card: MinimalCard;
};

function makeDeckCard(
  name: string,
  quantity: number,
  zone: Zone,
  gameChanger = false,
): MinimalDeckCard {
  return {
    id: `dc-${name}-${zone}`,
    quantity,
    zone,
    card: { name, gameChanger },
  };
}

function makeDeck(
  format: Format,
  cards: MinimalDeckCard[],
  manualBracket: number | null = null,
): Deck {
  return {
    id: "deck-1",
    name: "Test Deck",
    format,
    manualBracket,
    visibility: "PRIVATE",
    cards: cards as unknown as Deck["cards"],
  } as unknown as Deck;
}

describe("suggestBracket", () => {
  it("returns 2 for 0 game changers", () => {
    expect(suggestBracket(0)).toBe(2);
  });

  it("returns 3 for 1–3 game changers", () => {
    expect(suggestBracket(1)).toBe(3);
    expect(suggestBracket(2)).toBe(3);
    expect(suggestBracket(3)).toBe(3);
  });

  it("returns 4 for 4+ game changers", () => {
    expect(suggestBracket(4)).toBe(4);
    expect(suggestBracket(12)).toBe(4);
  });
});

describe("countGameChangers", () => {
  it("sums game changer flags across mainboard and commander zones", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("Rhystic Study", 1, Zone.MAINBOARD, true),
      makeDeckCard("Mana Drain", 1, Zone.MAINBOARD, true),
      makeDeckCard("Filler", 1, Zone.MAINBOARD, false),
      makeDeckCard("Commander", 1, Zone.COMMANDER, true),
    ]);
    expect(countGameChangers(deck)).toBe(3);
  });

  it("ignores sideboard and considering zones", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("Rhystic Study", 1, Zone.SIDEBOARD, true),
      makeDeckCard("Mana Drain", 1, Zone.CONSIDERING, true),
    ]);
    expect(countGameChangers(deck)).toBe(0);
  });

  it("respects quantity", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("Wastes", 3, Zone.MAINBOARD, true),
    ]);
    expect(countGameChangers(deck)).toBe(3);
  });
});

describe("resolveDeckBracket", () => {
  it("returns null for non-commander formats", () => {
    const deck = makeDeck(Format.MODERN, [
      makeDeckCard("Thoughtseize", 4, Zone.MAINBOARD, true),
    ]);
    expect(resolveDeckBracket(deck)).toBeNull();
  });

  it("suggests bracket 2 with 0 game changers", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("Filler", 99, Zone.MAINBOARD),
      makeDeckCard("Commander", 1, Zone.COMMANDER),
    ]);
    const result = resolveDeckBracket(deck);
    expect(result).not.toBeNull();
    expect(result!.bracket).toBe(2);
    expect(result!.suggested).toBe(2);
    expect(result!.gameChangers).toBe(0);
    expect(result!.manual).toBe(false);
    expect(result!.gameChangerCards).toHaveLength(0);
  });

  it("suggests bracket 3 with 1 game changer", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("Rhystic Study", 1, Zone.MAINBOARD, true),
    ]);
    const result = resolveDeckBracket(deck)!;
    expect(result.bracket).toBe(3);
    expect(result.suggested).toBe(3);
    expect(result.gameChangers).toBe(1);
    expect(result.gameChangerCards).toEqual([
      { name: "Rhystic Study", quantity: 1 },
    ]);
  });

  it("suggests bracket 3 with 3 game changers", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("A", 1, Zone.MAINBOARD, true),
      makeDeckCard("B", 1, Zone.MAINBOARD, true),
      makeDeckCard("C", 1, Zone.MAINBOARD, true),
    ]);
    const result = resolveDeckBracket(deck)!;
    expect(result.bracket).toBe(3);
    expect(result.suggested).toBe(3);
    expect(result.gameChangers).toBe(3);
  });

  it("suggests bracket 4 with 4+ game changers", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("A", 1, Zone.MAINBOARD, true),
      makeDeckCard("B", 1, Zone.MAINBOARD, true),
      makeDeckCard("C", 1, Zone.MAINBOARD, true),
      makeDeckCard("D", 1, Zone.MAINBOARD, true),
    ]);
    const result = resolveDeckBracket(deck)!;
    expect(result.bracket).toBe(4);
    expect(result.suggested).toBe(4);
  });

  it("aggregates quantities for duplicate game changer names and ignores sideboard", () => {
    const deck = makeDeck(Format.COMMANDER, [
      makeDeckCard("Sol Ring", 1, Zone.MAINBOARD, true),
      makeDeckCard("Sol Ring", 2, Zone.MAINBOARD, true),
      makeDeckCard("Sol Ring", 1, Zone.SIDEBOARD, true),
    ]);
    const result = resolveDeckBracket(deck)!;
    expect(result.gameChangerCards).toEqual([
      { name: "Sol Ring", quantity: 3 },
    ]);
  });

  it("manual override wins over suggestion", () => {
    const deck = makeDeck(
      Format.COMMANDER,
      [makeDeckCard("Rhystic Study", 1, Zone.MAINBOARD, true)],
      5,
    );
    const result = resolveDeckBracket(deck)!;
    expect(result.bracket).toBe(5);
    expect(result.suggested).toBe(3);
    expect(result.manual).toBe(true);
  });

  it("BRACKETS contains all five levels with Bracket 1 and 5 manual-only", () => {
    expect(BRACKETS.map((b) => b.id)).toEqual([1, 2, 3, 4, 5]);
    expect(BRACKETS.find((b) => b.id === 1)?.manualOnly).toBe(true);
    expect(BRACKETS.find((b) => b.id === 5)?.manualOnly).toBe(true);
    expect(BRACKETS.find((b) => b.id === 3)?.manualOnly).toBeFalsy();
  });
});

describe("getBracketInfo", () => {
  it("returns the matching bracket by id", () => {
    expect(getBracketInfo(3)).toMatchObject({ id: 3, name: "Upgraded" });
  });

  it("returns null when no bracket matches", () => {
    expect(getBracketInfo(99)).toBeNull();
    expect(getBracketInfo(0)).toBeNull();
  });
});
