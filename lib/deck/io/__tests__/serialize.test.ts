import { describe, expect, it } from "vitest";
import {
  toPlainText,
  toArena,
  toMaindeckJson,
  stripCommentHeaders,
} from "../serialize";
import { detectFormat, parseDecklist } from "../parse";
import type { Zone } from "@/lib/generated/prisma/client";
import type { SerializedPrinting } from "@/lib/deck/queries";
import type { DeckCardWithDetails, DeckWithCards } from "../adapters/types";

type Printing = SerializedPrinting;

function makeCard(overrides: { id: number; name: string }): { name: string } {
  return { name: overrides.name };
}

type DeckCardInput = {
  id: string;
  deckId: string;
  cardId: number;
  card: { name: string };
  printing?: Printing | null;
  printingId?: number | null;
  zone?: Zone;
  quantity?: number;
  isFoil?: boolean;
  /** Ordered memberships; `[0]` is the primary. */
  categories?: string[];
};

function makeDeckCard(overrides: DeckCardInput): DeckCardWithDetails {
  const {
    card,
    printing = null,
    printingId = null,
    zone = "MAINBOARD",
    quantity = 1,
    isFoil = false,
    categories = [],
  } = overrides;
  return { quantity, zone, categories, isFoil, printingId, card, printing };
}

function makeCategory(
  name: string,
  sortOrder: number,
): { name: string; sortOrder: number } {
  return { name, sortOrder };
}

function makeDeck(
  cards: DeckCardWithDetails[],
  categories: { name: string; sortOrder: number }[] = [],
): DeckWithCards {
  return {
    name: "Test Deck",
    format: "COMMANDER",
    visibility: "PRIVATE",
    description: null,
    cards,
    categories,
  };
}

const boltCard = makeCard({ id: 1, name: "Lightning Bolt" });
const solRingCard = makeCard({ id: 2, name: "Sol Ring" });
const duressCard = makeCard({ id: 3, name: "Duress" });
const atraxaCard = makeCard({ id: 4, name: "Atraxa, Praetors' Voice" });

describe("toPlainText", () => {
  it("outputs quantity and name per line with zone header", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
    ]);
    const result = toPlainText(deck);
    expect(result).toContain("// Mainboard");
    expect(result).toContain("4 Lightning Bolt");
  });

  it("groups cards by zone with fixed order: Commander, Mainboard, Sideboard, Considering", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 3,
        card: duressCard,
        quantity: 2,
        zone: "SIDEBOARD",
      }),
      makeDeckCard({
        id: "dc3",
        deckId: "deck1",
        cardId: 4,
        card: atraxaCard,
        quantity: 1,
        zone: "COMMANDER",
      }),
    ]);
    const result = toPlainText(deck);
    const lines = result.split("\n");
    const cmdIdx = lines.indexOf("// Commander");
    const mainIdx = lines.indexOf("// Mainboard");
    const sideIdx = lines.indexOf("// Sideboard");
    expect(cmdIdx).toBeLessThan(mainIdx);
    expect(mainIdx).toBeLessThan(sideIdx);
  });

  it("skips empty zones", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
    ]);
    const result = toPlainText(deck);
    expect(result).not.toContain("// Sideboard");
    expect(result).not.toContain("// Considering");
    expect(result).not.toContain("// Commander");
  });

  it("nests Mainboard subcategories when any card has one", () => {
    const deck = makeDeck(
      [
        makeDeckCard({
          id: "dc1",
          deckId: "deck1",
          cardId: 1,
          card: boltCard,
          quantity: 4,
          zone: "MAINBOARD",
          categories: ["Burn"],
        }),
        makeDeckCard({
          id: "dc2",
          deckId: "deck1",
          cardId: 2,
          card: solRingCard,
          quantity: 1,
          zone: "MAINBOARD",
          categories: ["Ramp"],
        }),
      ],
      [makeCategory("Ramp", 0), makeCategory("Burn", 1)],
    );
    const result = toPlainText(deck);
    const lines = result.split("\n");
    expect(lines).toContain("// Mainboard");
    expect(lines).toContain("// Ramp");
    expect(lines).toContain("// Burn");
    expect(lines.indexOf("// Ramp")).toBeLessThan(lines.indexOf("// Burn"));
  });

  it("emits uncategorized mainboard cards without a header alongside categorized ones", () => {
    const deck = makeDeck(
      [
        makeDeckCard({
          id: "dc1",
          deckId: "deck1",
          cardId: 1,
          card: boltCard,
          quantity: 4,
          zone: "MAINBOARD",
          categories: ["Burn"],
        }),
        makeDeckCard({
          id: "dc2",
          deckId: "deck1",
          cardId: 2,
          card: solRingCard,
          quantity: 1,
          zone: "MAINBOARD",
          categories: [],
        }),
      ],
      [makeCategory("Burn", 0)],
    );
    const lines = toPlainText(deck).split("\n");
    expect(lines).toContain("// Mainboard");
    expect(lines).toContain("// Burn");
    expect(lines).toContain("4 Lightning Bolt");
    expect(lines).toContain("1 Sol Ring");
  });

  it("emits a multi-category card once, under its primary category only", () => {
    const deck = makeDeck(
      [
        makeDeckCard({
          id: "dc1",
          deckId: "deck1",
          cardId: 2,
          card: solRingCard,
          quantity: 1,
          zone: "MAINBOARD",
          categories: ["Ramp", "Burn"],
        }),
        makeDeckCard({
          id: "dc2",
          deckId: "deck1",
          cardId: 1,
          card: boltCard,
          quantity: 4,
          zone: "MAINBOARD",
          categories: ["Burn"],
        }),
      ],
      [makeCategory("Ramp", 0), makeCategory("Burn", 1)],
    );
    const lines = toPlainText(deck).split("\n");

    // Sol Ring appears exactly once, in the Ramp (primary) section.
    const solRingLines = lines.filter((l) => l === "1 Sol Ring");
    expect(solRingLines).toHaveLength(1);
    const rampIdx = lines.indexOf("// Ramp");
    const burnIdx = lines.indexOf("// Burn");
    const solRingIdx = lines.indexOf("1 Sol Ring");
    expect(solRingIdx).toBeGreaterThan(rampIdx);
    expect(solRingIdx).toBeLessThan(burnIdx);
  });

  it("emits Mainboard flat when no cards have subcategories", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
        categories: [],
      }),
    ]);
    const result = toPlainText(deck);
    expect(result).toContain("// Mainboard");
    expect(result).not.toContain("// Ramp");
  });
});

describe("composed round-trip — multi-category cards", () => {
  const deck = makeDeck(
    [
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 2,
        card: solRingCard,
        quantity: 1,
        categories: ["ramp", "rocks"],
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 3,
        card: duressCard,
        quantity: 2,
        zone: "SIDEBOARD",
      }),
    ],
    [makeCategory("ramp", 0), makeCategory("rocks", 1)],
  );

  it("text: a multi-category card serializes once (under its primary) and re-imports as one row with its original quantity", () => {
    const text = toPlainText(deck);
    // One line only — a per-membership line would double the quantity on
    // re-import.
    expect(text.match(/Sol Ring/g)).toHaveLength(1);

    const parsed = parseDecklist(text, detectFormat(text));
    const solRing = parsed.cards.filter((c) => c.name === "Sol Ring");
    expect(solRing).toHaveLength(1);
    expect(solRing[0]).toMatchObject({
      quantity: 1,
      zone: "MAINBOARD",
      // Text is a lossy format: memberships (including the primary) drop on
      // re-import; only the JSON round-trip is lossless.
      categories: [],
    });
    expect(
      parsed.cards.find((c) => c.name === "Duress"),
    ).toMatchObject({ quantity: 2, zone: "SIDEBOARD" });
  });

  it("arena: a multi-category card serializes once and re-imports as one row with its original quantity", () => {
    const text = toArena(deck);
    expect(text.match(/Sol Ring/g)).toHaveLength(1);

    const parsed = parseDecklist(text, detectFormat(text));
    const solRing = parsed.cards.filter((c) => c.name === "Sol Ring");
    expect(solRing).toHaveLength(1);
    expect(solRing[0]).toMatchObject({
      quantity: 1,
      zone: "MAINBOARD",
      categories: [],
    });
  });
});

describe("stripCommentHeaders", () => {
  it("removes zone headers", () => {
    const input = [
      "// Commander",
      "1 Atraxa, Praetors' Voice",
      "// Mainboard",
      "4 Lightning Bolt",
      "// Sideboard",
      "2 Duress",
      "// Considering",
      "1 Sol Ring",
    ].join("\n");
    const result = stripCommentHeaders(input);
    expect(result).not.toContain("//");
    expect(result).toContain("4 Lightning Bolt");
    expect(result).toContain("2 Duress");
  });

  it("removes category headers", () => {
    const input = ["// Mainboard", "// Ramp", "1 Sol Ring"].join("\n");
    const result = stripCommentHeaders(input);
    expect(result).not.toContain("// Ramp");
    expect(result).toBe("1 Sol Ring");
  });

  it("keeps card lines whose name contains //", () => {
    const input = [
      "// Mainboard",
      "1 Fire // Ice",
      "2 Wear // Tear",
    ].join("\n");
    const result = stripCommentHeaders(input);
    expect(result).toContain("1 Fire // Ice");
    expect(result).toContain("2 Wear // Tear");
    expect(result).not.toContain("// Mainboard");
  });

  it("collapses blank lines left behind and trims", () => {
    const input = [
      "",
      "// Mainboard",
      "",
      "4 Lightning Bolt",
      "",
      "// Sideboard",
      "",
      "2 Duress",
      "",
    ].join("\n");
    const result = stripCommentHeaders(input);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result.startsWith("4 Lightning Bolt")).toBe(true);
    expect(result.endsWith("2 Duress")).toBe(true);
  });

  it("round-trips a real toPlainText output to only qty name lines", () => {
    const deck = makeDeck(
      [
        makeDeckCard({
          id: "dc1",
          deckId: "deck1",
          cardId: 1,
          card: boltCard,
          quantity: 4,
          zone: "MAINBOARD",
          categories: ["Burn"],
        }),
        makeDeckCard({
          id: "dc2",
          deckId: "deck1",
          cardId: 2,
          card: solRingCard,
          quantity: 1,
          zone: "MAINBOARD",
          categories: ["Ramp"],
        }),
      ],
      [makeCategory("Ramp", 0), makeCategory("Burn", 1)],
    );
    const result = stripCommentHeaders(toPlainText(deck));
    const lines = result.split("\n").filter((l) => l.trim() !== "");
    expect(lines.every((l) => /^\d+ /.test(l))).toBe(true);
    expect(lines).toContain("4 Lightning Bolt");
    expect(lines).toContain("1 Sol Ring");
  });
});

describe("toArena", () => {
  it("uses 'Deck' header for mainboard cards", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
    ]);
    const result = toArena(deck);
    expect(result.split("\n")[0]).toBe("Deck");
    expect(result).toContain("4 Lightning Bolt");
  });

  it("appends set and collector number when printing is available", () => {
    const printing: Printing = {
      setCode: "lea",
      setName: "Limited Edition Alpha",
      collectorNumber: "161",
      imageUri: "",
      rarity: null,
      priceUsd: null,
      priceUsdFoil: null,
      priceEur: null,
      priceEurFoil: null,
    };
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
        printingId: 10,
        printing,
      }),
    ]);
    const result = toArena(deck);
    expect(result).toContain("4 Lightning Bolt (LEA) 161");
  });

  it("uses 'Sideboard' header for sideboard cards", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 3,
        card: duressCard,
        quantity: 2,
        zone: "SIDEBOARD",
      }),
    ]);
    const result = toArena(deck);
    expect(result).toContain("Sideboard");
    expect(result).toContain("2 Duress");
  });

  it("folds COMMANDER cards into the Deck section", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 4,
        card: atraxaCard,
        quantity: 1,
        zone: "COMMANDER",
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
    ]);
    const result = toArena(deck);
    expect(result.split("\n")[0]).toBe("Deck");
    expect(result).toContain("Atraxa");
    expect(result).toContain("Lightning Bolt");
  });

  it("emits only the Sideboard section when there are no mainboard cards", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 3,
        card: duressCard,
        quantity: 2,
        zone: "SIDEBOARD",
      }),
    ]);
    const result = toArena(deck);
    expect(result.split("\n")[0]).toBe("Sideboard");
    expect(result).not.toContain("Deck\n");
    expect(result).toContain("2 Duress");
  });

  it("returns empty string when the deck has no representable cards", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 1,
        zone: "CONSIDERING",
      }),
    ]);
    expect(toArena(deck)).toBe("");
  });

  it("round-trips through parseDecklist", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 3,
        card: duressCard,
        quantity: 2,
        zone: "SIDEBOARD",
      }),
    ]);
    const exported = toArena(deck);
    const { cards } = parseDecklist(exported, detectFormat(exported));
    expect(cards.find((c) => c.name === "Lightning Bolt")?.quantity).toBe(4);
    expect(cards.find((c) => c.name === "Duress")?.zone).toBe("SIDEBOARD");
  });

  it("emits 'Companion' section before Deck when a companion is present", () => {
    const lurrusCard = makeCard({ id: 5, name: "Lurrus of the Dream-Den" });
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 5,
        card: lurrusCard,
        quantity: 1,
        zone: "COMPANION",
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
    ]);
    const result = toArena(deck);
    const lines = result.split("\n");
    expect(lines[0]).toBe("Companion");
    expect(lines[1]).toBe("1 Lurrus of the Dream-Den");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("Deck");
  });
});

describe("toMaindeckJson", () => {
  it("produces valid JSON", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
    ]);
    expect(() => JSON.parse(toMaindeckJson(deck))).not.toThrow();
  });

  it("includes name, format, visibility, cards, and categories", () => {
    const deck = makeDeck(
      [
        makeDeckCard({
          id: "dc1",
          deckId: "deck1",
          cardId: 1,
          card: boltCard,
          quantity: 4,
          zone: "MAINBOARD",
        }),
      ],
      [makeCategory("Ramp", 0)],
    );
    const parsed = JSON.parse(toMaindeckJson(deck));
    expect(parsed.name).toBe("Test Deck");
    expect(parsed.format).toBe("COMMANDER");
    expect(parsed.visibility).toBe("PRIVATE");
    expect(Array.isArray(parsed.cards)).toBe(true);
    expect(Array.isArray(parsed.categories)).toBe(true);
  });

  it("sorts cards alphabetically within the same zone", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 2,
        card: solRingCard,
        quantity: 1,
        zone: "MAINBOARD",
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
      }),
    ]);
    const parsed = JSON.parse(toMaindeckJson(deck));
    const names = parsed.cards.map((c: { name: string }) => c.name);
    expect(names).toEqual(["Lightning Bolt", "Sol Ring"]);
  });

  it("emits set, collectorNumber, and printingId when a printing is pinned", () => {
    const printing: Printing = {
      setCode: "lea",
      setName: "Limited Edition Alpha",
      collectorNumber: "161",
      imageUri: "",
      rarity: null,
      priceUsd: null,
      priceUsdFoil: null,
      priceEur: null,
      priceEurFoil: null,
    };
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
        printingId: 10,
        printing,
      }),
    ]);
    const parsed = JSON.parse(toMaindeckJson(deck));
    const card = parsed.cards[0];
    expect(card.set).toBe("LEA");
    expect(card.collectorNumber).toBe("161");
    expect(card.printingId).toBe(10);
  });

  it("orders categories by sortOrder", () => {
    const deck = makeDeck(
      [
        makeDeckCard({
          id: "dc1",
          deckId: "deck1",
          cardId: 1,
          card: boltCard,
          quantity: 4,
          zone: "MAINBOARD",
        }),
      ],
      [makeCategory("Burn", 5), makeCategory("Ramp", 1), makeCategory("Removal", 3)],
    );
    const parsed = JSON.parse(toMaindeckJson(deck));
    expect(parsed.categories.map((c: { name: string }) => c.name)).toEqual([
      "Ramp",
      "Removal",
      "Burn",
    ]);
  });

  it("emits zone + ordered categories per card", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
        categories: ["Burn", "Removal"],
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 3,
        card: duressCard,
        quantity: 2,
        zone: "SIDEBOARD",
        categories: [],
      }),
    ]);
    const parsed = JSON.parse(toMaindeckJson(deck));
    const bolt = parsed.cards.find(
      (c: { name: string }) => c.name === "Lightning Bolt",
    );
    const duress = parsed.cards.find(
      (c: { name: string }) => c.name === "Duress",
    );
    expect(bolt.zone).toBe("MAINBOARD");
    expect(bolt.categories).toEqual(["Burn", "Removal"]);
    expect(duress.zone).toBe("SIDEBOARD");
    expect(duress.categories).toEqual([]);
  });
});
