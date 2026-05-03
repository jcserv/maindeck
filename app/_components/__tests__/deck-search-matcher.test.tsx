import { describe, expect, it } from "vitest";
import type { DeckCard } from "@/lib/deck/zone-view";
import { matchDeckCards } from "../deck-search-matcher";

function makeCard(
  id: string,
  name: string,
  typeLine: string | null = null,
  oracleText: string | null = null,
): DeckCard {
  return {
    id,
    card: {
      name,
      typeLine,
      oracleText,
    },
  } as unknown as DeckCard;
}

describe("matchDeckCards", () => {
  it("returns empty when query is blank", () => {
    const { ids, ranked } = matchDeckCards(
      [makeCard("1", "Sol Ring")],
      "   ",
    );
    expect(ids.size).toBe(0);
    expect(ranked).toHaveLength(0);
  });

  it("finds substring matches on name", () => {
    const cards = [
      makeCard("1", "Sol Ring"),
      makeCard("2", "Counterspell"),
      makeCard("3", "Ring of Renewal"),
    ];
    const { ids } = matchDeckCards(cards, "ring");
    expect(ids).toEqual(new Set(["1", "3"]));
  });

  it("is case-insensitive", () => {
    const { ids } = matchDeckCards([makeCard("1", "Sol Ring")], "SOL");
    expect(ids.has("1")).toBe(true);
  });

  it("ranks exact > prefix > substring > type > oracle", () => {
    const cards = [
      makeCard("oracle", "Something Else", "Creature", "mentions dragon here"),
      makeCard("type", "Another", "Dragon Creature", null),
      makeCard("substring", "Red Dragon"),
      makeCard("prefix", "Dragonlord"),
      makeCard("exact", "Dragon"),
    ];
    const { ranked } = matchDeckCards(cards, "dragon");
    expect(ranked.map((dc) => dc.id)).toEqual([
      "exact",
      "prefix",
      "substring",
      "type",
      "oracle",
    ]);
  });

  it("breaks ties by name", () => {
    const cards = [
      makeCard("1", "Sol Ring"),
      makeCard("2", "Sol Talisman"),
    ];
    const { ranked } = matchDeckCards(cards, "sol");
    expect(ranked.map((dc) => dc.card.name)).toEqual([
      "Sol Ring",
      "Sol Talisman",
    ]);
  });

  it("falls back to type/oracle only when name has no match", () => {
    const cards = [
      makeCard("1", "Forest", "Basic Land — Forest", null),
      makeCard("2", "Llanowar Elves", "Creature — Elf Druid", "Tap: Add G."),
    ];
    const { ids } = matchDeckCards(cards, "elf");
    expect(ids).toEqual(new Set(["2"]));
  });

  it("matches on oracle text (e.g. 'flying' across a deck)", () => {
    const cards = [
      makeCard("1", "Serra Angel", "Creature — Angel", "Flying, vigilance"),
      makeCard("2", "Baleful Strix", "Artifact Creature — Bird", "Flying"),
      makeCard("3", "Llanowar Elves", "Creature — Elf Druid", "Tap: Add G."),
    ];
    const { ids } = matchDeckCards(cards, "flying");
    expect(ids).toEqual(new Set(["1", "2"]));
  });

  describe("syntax path (operator queries)", () => {
    function makeCardWithFields(
      id: string,
      overrides: Partial<{
        name: string;
        typeLine: string | null;
        oracleText: string | null;
        cmc: number | null;
        colors: string[];
        colorIdentity: string[];
      }>,
    ): DeckCard {
      return {
        id,
        card: {
          name: "Card",
          typeLine: null,
          oracleText: null,
          cmc: 0,
          colors: [],
          colorIdentity: [],
          ...overrides,
        },
      } as unknown as DeckCard;
    }

    it("routes c:r through the syntax parser (filters by colors)", () => {
      const cards = [
        makeCardWithFields("a", { name: "Lightning Bolt", colors: ["R"] }),
        makeCardWithFields("b", { name: "Counterspell", colors: ["U"] }),
      ];
      const { ids } = matchDeckCards(cards, "c:r");
      expect(ids).toEqual(new Set(["a"]));
    });

    it("routes cmc<=2 through the syntax parser", () => {
      const cards = [
        makeCardWithFields("a", { name: "Bolt", cmc: 1 }),
        makeCardWithFields("b", { name: "Counterspell", cmc: 2 }),
        makeCardWithFields("c", { name: "Wrath", cmc: 4 }),
      ];
      const { ids } = matchDeckCards(cards, "cmc<=2");
      expect(ids).toEqual(new Set(["a", "b"]));
    });

    it("routes t:creature through the syntax parser", () => {
      const cards = [
        makeCardWithFields("a", { name: "Goblin", typeLine: "Creature — Goblin" }),
        makeCardWithFields("b", { name: "Bolt", typeLine: "Instant" }),
      ];
      const { ids } = matchDeckCards(cards, "t:creature");
      expect(ids).toEqual(new Set(["a"]));
    });
  });
});
