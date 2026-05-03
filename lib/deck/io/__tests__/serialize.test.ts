import { describe, expect, it } from "vitest";
import { toPlainText, toArena, toMaindeckJson } from "../serialize";
import { detectFormat, parseDecklist } from "../parse";
import type {
  Deck,
  DeckCard,
  Card,
  DeckCategory,
  Zone,
} from "@/lib/generated/prisma/client";
import type { SerializedPrinting } from "@/lib/deck/queries";

type Printing = SerializedPrinting;

function makeCard(overrides: Partial<Card> & { id: number; name: string }): Card {
  return {
    nameSlug: null,
    mainType: "Instant" as Card["mainType"],
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
  };
}

type DeckCardInput = Partial<DeckCard> & {
  id: string;
  deckId: string;
  cardId: number;
  card: Card;
  printing?: Printing | null;
  zone?: Zone;
};

function makeDeckCard(
  overrides: DeckCardInput,
): DeckCard & { card: Card; printing: Printing | null } {
  const { printing = null, ...rest } = overrides;
  return {
    quantity: 1,
    zone: "MAINBOARD",
    category: null,
    printingId: null,
    isFoil: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
    printing,
  } as DeckCard & { card: Card; printing: Printing | null };
}

function makeCategory(
  name: string,
  sortOrder: number,
  deckId = "deck1",
): DeckCategory {
  return {
    id: `cat-${name}`,
    deckId,
    name,
    sortOrder,
    createdAt: new Date(),
  } as DeckCategory;
}

function makeDeck(
  cards: (DeckCard & { card: Card; printing: Printing | null })[],
  categories: DeckCategory[] = [],
): Deck & {
  cards: (DeckCard & { card: Card; printing: Printing | null })[];
  categories: DeckCategory[];
} {
  return {
    id: "deck1",
    userId: "user1",
    name: "Test Deck",
    description: null,
    format: "COMMANDER" as Deck["format"],
    visibility: "PRIVATE" as Deck["visibility"],
    manualBracket: null,
    forkedFromId: null,
    externalSource: null,
    externalId: null,
    externalVersion: null,
    releasedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
          category: "Burn",
        }),
        makeDeckCard({
          id: "dc2",
          deckId: "deck1",
          cardId: 2,
          card: solRingCard,
          quantity: 1,
          zone: "MAINBOARD",
          category: "Ramp",
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

  it("emits Mainboard flat when no cards have subcategories", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
        category: null,
      }),
    ]);
    const result = toPlainText(deck);
    expect(result).toContain("// Mainboard");
    expect(result).not.toContain("// Ramp");
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

  it("emits zone + nullable category per card", () => {
    const deck = makeDeck([
      makeDeckCard({
        id: "dc1",
        deckId: "deck1",
        cardId: 1,
        card: boltCard,
        quantity: 4,
        zone: "MAINBOARD",
        category: "Burn",
      }),
      makeDeckCard({
        id: "dc2",
        deckId: "deck1",
        cardId: 3,
        card: duressCard,
        quantity: 2,
        zone: "SIDEBOARD",
        category: null,
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
    expect(bolt.category).toBe("Burn");
    expect(duress.zone).toBe("SIDEBOARD");
    expect(duress.category).toBeNull();
  });
});
