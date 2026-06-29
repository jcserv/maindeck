import { describe, expect, it } from "vitest";
import type { CardType, Zone } from "@/lib/generated/prisma/enums";
import {
  type ComparableDeck,
  type ComparableDeckCard,
  compareDeckCards,
  compareDeckStats,
  compareDecks,
} from "../compare";

function card(
  cardId: number,
  name: string,
  overrides: Partial<{
    quantity: number;
    zone: Zone;
    mainType: CardType;
    typeLine: string;
    manaCost: string;
    cmc: number;
    colors: string[];
  }> = {},
): ComparableDeckCard {
  return {
    cardId,
    quantity: overrides.quantity ?? 1,
    zone: overrides.zone ?? ("MAINBOARD" as Zone),
    card: {
      name,
      mainType: (overrides.mainType ?? "Creature") as CardType,
      typeLine: overrides.typeLine ?? "Creature",
      oracleText: "",
      manaCost: overrides.manaCost ?? "{1}",
      cmc: overrides.cmc ?? 1,
      colors: overrides.colors ?? [],
    },
    printing: null,
  };
}

function deck(id: string, name: string, cards: ComparableDeckCard[]): ComparableDeck {
  return { id, name, format: "COMMANDER" as never, cards };
}

describe("compareDeckCards", () => {
  it("splits cards into added / removed / shared by oracle Card id", () => {
    const a = deck("a", "A", [
      card(1, "Sol Ring"),
      card(2, "Swords to Plowshares"),
    ]);
    const b = deck("b", "B", [
      card(1, "Sol Ring"),
      card(3, "Path to Exile"),
    ]);

    const { added, removed, shared, summary } = compareDeckCards(a, b);

    expect(removed.map((c) => c.name)).toEqual(["Swords to Plowshares"]);
    expect(added.map((c) => c.name)).toEqual(["Path to Exile"]);
    expect(shared.map((c) => c.name)).toEqual(["Sol Ring"]);
    expect(summary).toEqual({
      addedCards: 1,
      removedCards: 1,
      sharedCards: 1,
      changedCards: 0,
    });
  });

  it("reports a quantity delta for shared cards held at different counts", () => {
    const a = deck("a", "A", [card(4, "Forest", { quantity: 10 })]);
    const b = deck("b", "B", [card(4, "Forest", { quantity: 14 })]);

    const { shared, summary } = compareDeckCards(a, b);

    expect(shared).toEqual([
      {
        cardId: 4,
        name: "Forest",
        aQuantity: 10,
        bQuantity: 14,
        delta: 4,
      },
    ]);
    expect(summary.changedCards).toBe(1);
  });

  it("aggregates copies of the same Card across zones before diffing", () => {
    // Same card pinned in COMMANDER + MAINBOARD collapses to one entry.
    const a = deck("a", "A", [
      card(5, "Kenrith", { zone: "COMMANDER" as Zone, quantity: 1 }),
      card(5, "Kenrith", { zone: "MAINBOARD" as Zone, quantity: 1 }),
    ]);
    const b = deck("b", "B", [
      card(5, "Kenrith", { zone: "COMMANDER" as Zone, quantity: 1 }),
    ]);

    const { shared } = compareDeckCards(a, b);

    expect(shared).toEqual([
      { cardId: 5, name: "Kenrith", aQuantity: 2, bQuantity: 1, delta: -1 },
    ]);
  });

  it("ignores SIDEBOARD and CONSIDERING cards", () => {
    const a = deck("a", "A", [
      card(1, "Sol Ring"),
      card(6, "Sideboard Card", { zone: "SIDEBOARD" as Zone }),
      card(7, "Maybe Card", { zone: "CONSIDERING" as Zone }),
    ]);
    const b = deck("b", "B", [card(1, "Sol Ring")]);

    const { added, removed, shared } = compareDeckCards(a, b);

    expect(removed).toEqual([]);
    expect(added).toEqual([]);
    expect(shared.map((c) => c.name)).toEqual(["Sol Ring"]);
  });

  it("sorts each bucket by card name", () => {
    const a = deck("a", "A", [
      card(8, "Zzz"),
      card(9, "Aaa"),
      card(10, "Mmm"),
    ]);
    const b = deck("b", "B", []);

    const { removed } = compareDeckCards(a, b);
    expect(removed.map((c) => c.name)).toEqual(["Aaa", "Mmm", "Zzz"]);
  });
});

describe("compareDeckStats", () => {
  it("computes a stat block per deck including counts and curve", () => {
    const a = deck("a", "A", [
      card(11, "Lightning Bolt", { cmc: 1, manaCost: "{R}", quantity: 4 }),
      card(12, "Island", {
        mainType: "Land" as CardType,
        typeLine: "Basic Land — Island",
        manaCost: "",
        cmc: 0,
        quantity: 6,
      }),
    ]);
    const b = deck("b", "B", [
      card(11, "Lightning Bolt", { cmc: 1, manaCost: "{R}", quantity: 4 }),
    ]);

    const { a: sa, b: sb } = compareDeckStats(a, b);

    expect(sa.cardCount).toBe(10);
    expect(sb.cardCount).toBe(4);
    expect(sa.landCount).toBe(6);
    expect(sb.landCount).toBe(0);
    expect(sa.colorPips.R).toBe(4);
    expect(sa.manaCurve["1"]).toBe(4);
  });
});

describe("compareDecks", () => {
  it("returns deck metadata alongside card and stat comparisons", () => {
    const a = deck("a", "Deck A", [card(1, "Sol Ring")]);
    const b = deck("b", "Deck B", [card(1, "Sol Ring")]);

    const result = compareDecks(a, b);

    expect(result.a).toEqual({ id: "a", name: "Deck A", format: "COMMANDER" });
    expect(result.b).toEqual({ id: "b", name: "Deck B", format: "COMMANDER" });
    expect(result.cards.shared).toHaveLength(1);
    expect(result.stats.a.cardCount).toBe(1);
  });
});
