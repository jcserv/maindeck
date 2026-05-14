import { describe, expect, it } from "vitest";
import {
  groupCards,
  parseSortDir,
  parseSortKey,
  sortCards,
  type GroupSortCard,
} from "../group-sort";

type TestCard = GroupSortCard & { id: string };

function makeCard(overrides: Partial<TestCard> = {}): TestCard {
  return {
    id: "c",
    card: {
      name: "Name",
      mainType: "Creature",
      colors: [],
      cmc: 0,
    },
    printing: null,
    category: null,
    ...overrides,
  };
}

function makePrinting(
  overrides: Partial<NonNullable<TestCard["printing"]>> = {},
): NonNullable<TestCard["printing"]> {
  return {
    setCode: "xxx",
    setName: "Set",
    priceUsd: null,
    rarity: null,
    ...overrides,
  };
}

describe("parseSortKey", () => {
  it("returns the parsed key for a known SortKey", () => {
    expect(parseSortKey("name")).toBe("name");
    expect(parseSortKey("mv")).toBe("mv");
    expect(parseSortKey("price")).toBe("price");
    expect(parseSortKey("rarity")).toBe("rarity");
  });

  it("falls back to 'name' for an unknown value or null", () => {
    expect(parseSortKey("bogus")).toBe("name");
    expect(parseSortKey(null)).toBe("name");
  });
});

describe("parseSortDir", () => {
  it("returns 'desc' only for the literal 'desc'", () => {
    expect(parseSortDir("desc")).toBe("desc");
  });

  it("returns 'asc' for anything else", () => {
    expect(parseSortDir("asc")).toBe("asc");
    expect(parseSortDir("bogus")).toBe("asc");
    expect(parseSortDir(null)).toBe("asc");
  });
});

describe("groupCards", () => {
  describe("category", () => {
    it("orders by categoryOrder, then extras, then uncategorized", () => {
      const cards = [
        makeCard({ id: "a", category: "Ramp" }),
        makeCard({ id: "b", category: null }),
        makeCard({ id: "c", category: "Draw" }),
        makeCard({ id: "d", category: "Kill" }),
      ];
      const sections = groupCards(cards, "category", ["Ramp", "Draw"]);
      expect(sections.map((s) => s.key)).toEqual([
        "Ramp",
        "Draw",
        "Kill",
        "__uncategorized__",
      ]);
      expect(sections[3]!.label).toBe("Uncategorized");
      expect(sections[0]!.cards.map((c) => c.id)).toEqual(["a"]);
    });

    it("includes empty user categories", () => {
      const sections = groupCards(
        [makeCard({ id: "a", category: null })],
        "category",
        ["Ramp"],
      );
      expect(sections.map((s) => s.key)).toEqual([
        "Ramp",
        "__uncategorized__",
      ]);
      expect(sections[0]!.cards).toHaveLength(0);
    });

    it("omits uncategorized section when empty", () => {
      const sections = groupCards(
        [makeCard({ id: "a", category: "Ramp" })],
        "category",
        ["Ramp"],
      );
      expect(sections.map((s) => s.key)).toEqual(["Ramp"]);
    });
  });

  describe("type", () => {
    it("omits the Other fallback section when no card maps to it", () => {
      const cards = [
        makeCard({ id: "c", card: makeCardShape({ mainType: "Creature" }) }),
        makeCard({ id: "l", card: makeCardShape({ mainType: "Land" }) }),
      ];
      const sections = groupCards(cards, "type", []);
      expect(sections.map((s) => s.key)).toEqual(["Creature", "Land"]);
    });

    it("orders by the fixed type order and puts unknowns in Other", () => {
      const cards = [
        makeCard({ id: "l", card: makeCardShape({ mainType: "Land" }) }),
        makeCard({ id: "c", card: makeCardShape({ mainType: "Creature" }) }),
        makeCard({ id: "s", card: makeCardShape({ mainType: "Sorcery" }) }),
        makeCard({ id: "x", card: makeCardShape({ mainType: "Scheme" }) }),
      ];
      const sections = groupCards(cards, "type", []);
      expect(sections.map((s) => s.key)).toEqual([
        "Creature",
        "Sorcery",
        "Land",
        "Other",
      ]);
    });
  });

  describe("color", () => {
    it("buckets by single/multi/colorless/land", () => {
      const cards = [
        makeCard({
          id: "w",
          card: makeCardShape({ mainType: "Creature", colors: ["W"] }),
        }),
        makeCard({
          id: "uw",
          card: makeCardShape({ mainType: "Creature", colors: ["U", "W"] }),
        }),
        makeCard({
          id: "c",
          card: makeCardShape({ mainType: "Artifact", colors: [] }),
        }),
        makeCard({
          id: "l",
          card: makeCardShape({ mainType: "Land", colors: [] }),
        }),
      ];
      const sections = groupCards(cards, "color", []);
      expect(sections.map((s) => s.key)).toEqual([
        "W",
        "Multicolor",
        "Colorless",
        "Land",
      ]);
    });
  });

  describe("mv", () => {
    it("buckets 0..6 and 7+", () => {
      const cards = [
        makeCard({ id: "0", card: makeCardShape({ cmc: 0 }) }),
        makeCard({ id: "1", card: makeCardShape({ cmc: 1 }) }),
        makeCard({ id: "7", card: makeCardShape({ cmc: 7 }) }),
        makeCard({ id: "10", card: makeCardShape({ cmc: 10 }) }),
      ];
      const sections = groupCards(cards, "mv", []);
      expect(sections.map((s) => s.key)).toEqual(["0", "1", "7+"]);
      expect(sections[2]!.cards.map((c) => c.id)).toEqual(["7", "10"]);
    });

    it("treats null cmc as 0", () => {
      const sections = groupCards(
        [makeCard({ id: "x", card: makeCardShape({ cmc: null }) })],
        "mv",
        [],
      );
      expect(sections[0]!.key).toBe("0");
    });
  });

  describe("set", () => {
    it("omits the No-printing section when every card has a printing", () => {
      const cards = [
        makeCard({
          id: "a",
          printing: makePrinting({ setCode: "aaa", setName: "Alpha" }),
        }),
        makeCard({
          id: "b",
          printing: makePrinting({ setCode: "bbb", setName: "Beta" }),
        }),
      ];
      const sections = groupCards(cards, "set", []);
      expect(sections.map((s) => s.key)).toEqual(["aaa", "bbb"]);
    });

    it("buckets multiple cards from the same set into one section", () => {
      const cards = [
        makeCard({
          id: "a1",
          printing: makePrinting({ setCode: "aaa", setName: "Alpha" }),
        }),
        makeCard({
          id: "a2",
          printing: makePrinting({ setCode: "aaa", setName: "Alpha" }),
        }),
      ];
      const sections = groupCards(cards, "set", []);
      expect(sections).toHaveLength(1);
      expect(sections[0]!.cards.map((c) => c.id)).toEqual(["a1", "a2"]);
    });

    it("orders alphabetically by setCode and groups missing printing", () => {
      const cards = [
        makeCard({
          id: "b",
          printing: makePrinting({ setCode: "bbb", setName: "Beta" }),
        }),
        makeCard({
          id: "a",
          printing: makePrinting({ setCode: "aaa", setName: "Alpha" }),
        }),
        makeCard({ id: "x", printing: null }),
      ];
      const sections = groupCards(cards, "set", []);
      expect(sections.map((s) => s.key)).toEqual([
        "aaa",
        "bbb",
        "__no_printing__",
      ]);
      expect(sections[0]!.label).toBe("Alpha");
      expect(sections[1]!.label).toBe("Beta");
      expect(sections[2]!.label).toBe("No printing");
    });
  });

  describe("rarity", () => {
    it("orders Mythic, Rare, Uncommon, Common, Special, Bonus, Unknown", () => {
      const cards = [
        makeCard({ id: "c", printing: makePrinting({ rarity: "Common" }) }),
        makeCard({ id: "m", printing: makePrinting({ rarity: "Mythic" }) }),
        makeCard({ id: "u", printing: makePrinting({ rarity: "Uncommon" }) }),
        makeCard({ id: "x", printing: null }),
      ];
      const sections = groupCards(cards, "rarity", []);
      expect(sections.map((s) => s.key)).toEqual([
        "Mythic",
        "Uncommon",
        "Common",
        "Unknown",
      ]);
    });

    it("falls into Unknown for an unrecognised rarity string", () => {
      const cards = [
        makeCard({ id: "p", printing: makePrinting({ rarity: "Promo" }) }),
      ];
      const sections = groupCards(cards, "rarity", []);
      expect(sections.map((s) => s.key)).toEqual(["Unknown"]);
    });
  });

  describe("color edges", () => {
    it("treats colors=null as Colorless via the `?? []` fallback", () => {
      const cards = [
        makeCard({
          id: "x",
          card: makeCardShape({ colors: null as unknown as string[] }),
        }),
      ];
      const sections = groupCards(cards, "color", []);
      expect(sections.map((s) => s.key)).toContain("Colorless");
    });

    it("buckets each WUBRG single-color card into its own color section", () => {
      const cards = [
        makeCard({ id: "w", card: makeCardShape({ colors: ["W"] }) }),
        makeCard({ id: "u", card: makeCardShape({ colors: ["U"] }) }),
        makeCard({ id: "b", card: makeCardShape({ colors: ["B"] }) }),
        makeCard({ id: "r", card: makeCardShape({ colors: ["R"] }) }),
        makeCard({ id: "g", card: makeCardShape({ colors: ["G"] }) }),
      ];
      const sections = groupCards(cards, "color", []);
      expect(sections.map((s) => s.key)).toEqual(["W", "U", "B", "R", "G"]);
    });

    it("treats a single non-WUBRG color as Colorless", () => {
      const cards = [
        makeCard({ id: "p", card: makeCardShape({ colors: ["P"] }) }),
      ];
      const sections = groupCards(cards, "color", []);
      expect(sections.map((s) => s.key)).toEqual(["Colorless"]);
    });
  });
});

describe("sortCards", () => {
  it("sorts by name ascending and descending", () => {
    const cards = [
      makeCard({ id: "b", card: makeCardShape({ name: "Beta" }) }),
      makeCard({ id: "a", card: makeCardShape({ name: "Alpha" }) }),
      makeCard({ id: "c", card: makeCardShape({ name: "Charlie" }) }),
    ];
    expect(sortCards(cards, "name", "asc").map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortCards(cards, "name", "desc").map((c) => c.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("sorts by mv asc/desc using 0 for null", () => {
    const cards = [
      makeCard({ id: "3", card: makeCardShape({ cmc: 3 }) }),
      makeCard({ id: "n", card: makeCardShape({ cmc: null }) }),
      makeCard({ id: "1", card: makeCardShape({ cmc: 1 }) }),
    ];
    expect(sortCards(cards, "mv", "asc").map((c) => c.id)).toEqual([
      "n",
      "1",
      "3",
    ]);
    expect(sortCards(cards, "mv", "desc").map((c) => c.id)).toEqual([
      "3",
      "1",
      "n",
    ]);
  });

  it("sorts by price using canonical printing fallback when unpinned", () => {
    const cards = [
      makeCard({
        id: "c3",
        printing: null,
        card: {
          name: "C3",
          mainType: "Creature",
          colors: [],
          cmc: 0,
          printings: [{ priceUsd: 3, priceUsdFoil: null }],
        },
      }),
      makeCard({
        id: "c1",
        printing: null,
        card: {
          name: "C1",
          mainType: "Creature",
          colors: [],
          cmc: 0,
          printings: [{ priceUsd: 1, priceUsdFoil: null }],
        },
      }),
      makeCard({ id: "p2", printing: makePrinting({ priceUsd: 2 }) }),
    ];
    expect(sortCards(cards, "price", "asc").map((c) => c.id)).toEqual([
      "c1",
      "p2",
      "c3",
    ]);
    expect(sortCards(cards, "price", "desc").map((c) => c.id)).toEqual([
      "c3",
      "p2",
      "c1",
    ]);
  });

  it("prefers foil price for foil cards when sorting by price", () => {
    const cards = [
      makeCard({
        id: "foil",
        isFoil: true,
        printing: makePrinting({ priceUsd: 1, priceUsdFoil: 10 }),
      }),
      makeCard({
        id: "nonfoil",
        isFoil: false,
        printing: makePrinting({ priceUsd: 5, priceUsdFoil: 50 }),
      }),
    ];
    expect(sortCards(cards, "price", "asc").map((c) => c.id)).toEqual([
      "nonfoil",
      "foil",
    ]);
  });

  it("sorts by price with nulls last regardless of direction", () => {
    const cards = [
      makeCard({ id: "3", printing: makePrinting({ priceUsd: 3 }) }),
      makeCard({ id: "n", printing: null }),
      makeCard({ id: "1", printing: makePrinting({ priceUsd: 1 }) }),
      makeCard({ id: "np", printing: makePrinting({ priceUsd: null }) }),
    ];
    const asc = sortCards(cards, "price", "asc").map((c) => c.id);
    expect(asc[0]).toBe("1");
    expect(asc[1]).toBe("3");
    expect(asc.slice(2).sort()).toEqual(["n", "np"]);

    const desc = sortCards(cards, "price", "desc").map((c) => c.id);
    expect(desc[0]).toBe("3");
    expect(desc[1]).toBe("1");
    expect(desc.slice(2).sort()).toEqual(["n", "np"]);
  });

  it("sorts by rarity enum index with unknowns last", () => {
    const cards = [
      makeCard({ id: "c", printing: makePrinting({ rarity: "Common" }) }),
      makeCard({ id: "m", printing: makePrinting({ rarity: "Mythic" }) }),
      makeCard({ id: "x", printing: null }),
      makeCard({ id: "u", printing: makePrinting({ rarity: "Uncommon" }) }),
    ];
    expect(sortCards(cards, "rarity", "asc").map((c) => c.id)).toEqual([
      "m",
      "u",
      "c",
      "x",
    ]);
    expect(sortCards(cards, "rarity", "desc").map((c) => c.id)).toEqual([
      "c",
      "u",
      "m",
      "x",
    ]);
  });

  it("treats a printing with null rarity as unknown when sorting by rarity", () => {
    // Exercises the `a.printing?.rarity ?? null` branch where the printing
    // exists but its `rarity` field is null (vs the printing-null path above).
    const cards = [
      makeCard({ id: "r", printing: makePrinting({ rarity: "Rare" }) }),
      makeCard({ id: "n", printing: makePrinting({ rarity: null }) }),
    ];
    expect(sortCards(cards, "rarity", "asc").map((c) => c.id)).toEqual(["r", "n"]);
  });

  it("treats an unrecognised rarity string as unknown via RARITY_INDEX fallback", () => {
    const cards = [
      makeCard({ id: "u", printing: makePrinting({ rarity: "Uncommon" }) }),
      makeCard({ id: "promo", printing: makePrinting({ rarity: "Promo" }) }),
    ];
    expect(sortCards(cards, "rarity", "asc").map((c) => c.id)).toEqual([
      "u",
      "promo",
    ]);
  });

  it("keeps two unknown-rarity cards stable (both Infinity)", () => {
    const cards = [
      makeCard({ id: "x1", printing: null }),
      makeCard({ id: "x2", printing: makePrinting({ rarity: null }) }),
    ];
    const result = sortCards(cards, "rarity", "asc").map((c) => c.id);
    expect(new Set(result)).toEqual(new Set(["x1", "x2"]));
  });
});

function makeCardShape(
  overrides: Partial<GroupSortCard["card"]> = {},
): GroupSortCard["card"] {
  return {
    name: "Name",
    mainType: "Creature",
    colors: [],
    cmc: 0,
    ...overrides,
  };
}
