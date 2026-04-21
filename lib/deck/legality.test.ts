import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { validateDeck, getCardLegalityForDeck } from "./legality";
import type { Deck } from "./zone-view";

// ---------------------------------------------------------------------------
// Minimal deck fixture helpers
// ---------------------------------------------------------------------------

type MinimalCard = {
  name: string;
  typeLine: string | null;
  legalities: Record<string, string>;
  colorIdentity: string[];
  printings: Array<{ imageUri: string }>;
};

type MinimalDeckCard = {
  id: string;
  quantity: number;
  zone: Zone;
  category: string | null;
  card: MinimalCard;
  printing: null;
};

function makeCard(
  name: string,
  legalities: Record<string, string> = {},
  typeLine: string | null = "Creature — Human",
  colorIdentity: string[] = [],
): MinimalCard {
  return {
    name,
    typeLine,
    legalities,
    colorIdentity,
    printings: [{ imageUri: "https://example.com/img.jpg" }],
  };
}

function makeDeckCard(
  name: string,
  quantity: number,
  zone: Zone,
  legalities: Record<string, string> = {},
  typeLine: string | null = "Creature — Human",
  colorIdentity: string[] = [],
): MinimalDeckCard {
  return {
    id: `dc-${name}-${zone}`,
    quantity,
    zone,
    category: null,
    card: makeCard(name, legalities, typeLine, colorIdentity),
    printing: null,
  };
}

function makeDeck(
  format: Format,
  cards: MinimalDeckCard[],
  overrides: Partial<Omit<Deck, "cards" | "format">> = {},
): Deck {
  return {
    id: "deck-1",
    name: "Test Deck",
    format,
    visibility: "PRIVATE",
    updatedAt: new Date(),
    userId: "user-1",
    cards: cards as unknown as Deck["cards"],
    categories: [],
    user: { id: "user-1", name: "Test", image: null },
    ...overrides,
  } as unknown as Deck;
}

// ---------------------------------------------------------------------------
// Standard (60-card format)
// ---------------------------------------------------------------------------

describe("validateDeck — Standard legal deck", () => {
  it("returns legal for a minimal valid 60-card standard deck", () => {
    const cards: MinimalDeckCard[] = Array.from({ length: 20 }, (_, i) =>
      makeDeckCard(`Card ${i}`, 3, Zone.MAINBOARD, {
        standard: "legal",
      }),
    );

    const deck = makeDeck(Format.STANDARD, cards);
    const result = validateDeck(deck);
    expect(result.legal).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe("validateDeck — Banned card in Standard", () => {
  it("flags a banned card with the correct issue code", () => {
    const legalCards = Array.from({ length: 20 }, (_, i) =>
      makeDeckCard(`Card ${i}`, 3, Zone.MAINBOARD, { standard: "legal" }),
    );
    const deck = makeDeck(Format.STANDARD, [
      ...legalCards,
      makeDeckCard("Lightning Bolt", 1, Zone.MAINBOARD, { standard: "banned" }),
    ]);
    const result = validateDeck(deck);
    expect(result.legal).toBe(false);
    const issue = result.issues.find((i) => i.code === "card_banned");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("Banned in Standard");
  });

  it("flags a restricted card", () => {
    const legalCards = Array.from({ length: 20 }, (_, i) =>
      makeDeckCard(`Card ${i}`, 3, Zone.MAINBOARD, { vintage: "legal" }),
    );
    const deck = makeDeck(Format.VINTAGE, [
      ...legalCards,
      makeDeckCard("Black Lotus", 1, Zone.MAINBOARD, { vintage: "restricted" }),
    ]);
    const result = validateDeck(deck);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.code === "card_restricted")).toBe(true);
  });

  it("flags a not_legal card", () => {
    const legalCards = Array.from({ length: 20 }, (_, i) =>
      makeDeckCard(`Card ${i}`, 3, Zone.MAINBOARD, { modern: "legal" }),
    );
    const deck = makeDeck(Format.MODERN, [
      ...legalCards,
      makeDeckCard("Some Old Card", 1, Zone.MAINBOARD, { modern: "not_legal" }),
    ]);
    const result = validateDeck(deck);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.code === "card_not_legal")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Commander — singleton violation
// ---------------------------------------------------------------------------

describe("validateDeck — Commander singleton violation", () => {
  it("flags duplicate non-basic cards across mainboard and commander zone", () => {
    const cards: MinimalDeckCard[] = [
      makeDeckCard("Sol Ring", 2, Zone.MAINBOARD, { commander: "legal" }),
      makeDeckCard("Commander Card", 1, Zone.COMMANDER, {
        commander: "legal",
      }),
      // fill to 100 total
      ...Array.from({ length: 32 }, (_, i) =>
        makeDeckCard(`Unique Card ${i}`, 3, Zone.MAINBOARD, {
          commander: "legal",
        }),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.code === "singleton_violation")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Commander — deck size rules
// ---------------------------------------------------------------------------

describe("validateDeck — Commander with 99 cards (missing 1)", () => {
  it("flags deck size not equal to 100", () => {
    // 98 mainboard + 1 commander = 99 total
    const cards: MinimalDeckCard[] = [
      makeDeckCard("Commander Card", 1, Zone.COMMANDER, {
        commander: "legal",
      }),
      ...Array.from({ length: 98 }, (_, i) =>
        makeDeckCard(`Unique Card ${i}`, 1, Zone.MAINBOARD, {
          commander: "legal",
        }),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.code === "deck_size")).toBe(true);
    expect(result.issues.find((i) => i.code === "deck_size")?.message).toContain(
      "99",
    );
  });
});

describe("validateDeck — Commander with exactly 100 cards and one commander", () => {
  it("is legal when the deck has 99 mainboard + 1 commander", () => {
    const cards: MinimalDeckCard[] = [
      makeDeckCard("Ur-Dragon", 1, Zone.COMMANDER, { commander: "legal" }),
      ...Array.from({ length: 99 }, (_, i) =>
        makeDeckCard(`Unique Card ${i}`, 1, Zone.MAINBOARD, {
          commander: "legal",
        }),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(result.legal).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe("validateDeck — Commander with zero commanders", () => {
  it("flags missing commander card", () => {
    const cards: MinimalDeckCard[] = Array.from({ length: 100 }, (_, i) =>
      makeDeckCard(`Unique Card ${i}`, 1, Zone.MAINBOARD, {
        commander: "legal",
      }),
    );
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.code === "no_commander")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Basic lands exempt from singleton
// ---------------------------------------------------------------------------

describe("validateDeck — Basic lands exempt from singleton", () => {
  it("allows multiple copies of basic lands by name", () => {
    const cards: MinimalDeckCard[] = [
      makeDeckCard("Commander Card", 1, Zone.COMMANDER, {
        commander: "legal",
      }),
      // 30 Plains (basic land by name)
      makeDeckCard("Plains", 30, Zone.MAINBOARD, { commander: "legal" }),
      // 69 other unique cards (singleton ok, just need count to reach 100)
      ...Array.from({ length: 69 }, (_, i) =>
        makeDeckCard(`Unique Card ${i}`, 1, Zone.MAINBOARD, {
          commander: "legal",
        }),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(result.issues.some((i) => i.code === "singleton_violation")).toBe(
      false,
    );
  });

  it("allows basic lands detected by typeLine", () => {
    const cards: MinimalDeckCard[] = [
      makeDeckCard("Commander Card", 1, Zone.COMMANDER, {
        commander: "legal",
      }),
      // Unusual basic land name but has Basic Land in typeLine
      {
        ...makeDeckCard(
          "Snow-Covered Island",
          20,
          Zone.MAINBOARD,
          { commander: "legal" },
          "Basic Snow Land — Island",
        ),
      },
      ...Array.from({ length: 79 }, (_, i) =>
        makeDeckCard(`Unique Card ${i}`, 1, Zone.MAINBOARD, {
          commander: "legal",
        }),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(result.issues.some((i) => i.code === "singleton_violation")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// BRAWL — no size rules
// ---------------------------------------------------------------------------

describe("validateDeck — Brawl no-size-rules happy path", () => {
  it("does not flag size violations for BRAWL format", () => {
    // Only 10 cards — would fail Standard size checks but should pass for Brawl
    const cards: MinimalDeckCard[] = Array.from({ length: 10 }, (_, i) =>
      makeDeckCard(`Unique Card ${i}`, 1, Zone.MAINBOARD, {
        brawl: "legal",
      }),
    );
    const deck = makeDeck(Format.BRAWL, cards);
    const result = validateDeck(deck);
    expect(result.issues.some((i) => i.code === "deck_size")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCardLegalityForDeck
// ---------------------------------------------------------------------------

describe("getCardLegalityForDeck", () => {
  it("returns legal for a legal card with 0 copies in deck", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Counterspell",
        legalities: { modern: "legal" },
        typeLine: "Instant",
      },
      format: Format.MODERN,
      currentCopiesInDeck: 0,
    });
    expect(result.legal).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("flags a banned card", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Skullclamp",
        legalities: { standard: "banned" },
        typeLine: "Artifact — Equipment",
      },
      format: Format.STANDARD,
      currentCopiesInDeck: 0,
    });
    expect(result.legal).toBe(false);
    expect(result.reasons[0]).toContain("Banned");
  });

  it("flags singleton violation when card already in deck", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Sol Ring",
        legalities: { commander: "legal" },
        typeLine: "Artifact",
      },
      format: Format.COMMANDER,
      currentCopiesInDeck: 1,
      addingQuantity: 1,
    });
    expect(result.legal).toBe(false);
    expect(result.reasons[0]).toContain("Singleton");
  });

  it("does not flag singleton for basic lands", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Forest",
        legalities: { commander: "legal" },
        typeLine: "Basic Land — Forest",
      },
      format: Format.COMMANDER,
      currentCopiesInDeck: 5,
      addingQuantity: 1,
    });
    expect(result.legal).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateDeck — Commander color identity
// ---------------------------------------------------------------------------

describe("validateDeck — Commander color identity", () => {
  it("allows an on-color mainboard card", () => {
    const cards: MinimalDeckCard[] = [
      makeDeckCard(
        "Baba Lysaga",
        1,
        Zone.COMMANDER,
        { commander: "legal" },
        "Legendary Creature — Human Warlock",
        ["B", "G"],
      ),
      makeDeckCard(
        "Putrefy",
        1,
        Zone.MAINBOARD,
        { commander: "legal" },
        "Instant",
        ["B", "G"],
      ),
      ...Array.from({ length: 98 }, (_, i) =>
        makeDeckCard(
          `Unique Card ${i}`,
          1,
          Zone.MAINBOARD,
          { commander: "legal" },
          "Creature — Human",
          ["B"],
        ),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(
      result.issues.some((i) => i.code === "color_identity_violation"),
    ).toBe(false);
  });

  it("flags a white card under a B/G commander", () => {
    const cards: MinimalDeckCard[] = [
      makeDeckCard(
        "Baba Lysaga",
        1,
        Zone.COMMANDER,
        { commander: "legal" },
        "Legendary Creature — Human Warlock",
        ["B", "G"],
      ),
      makeDeckCard(
        "Wrath of God",
        1,
        Zone.MAINBOARD,
        { commander: "legal" },
        "Sorcery",
        ["W"],
      ),
      ...Array.from({ length: 98 }, (_, i) =>
        makeDeckCard(
          `Unique Card ${i}`,
          1,
          Zone.MAINBOARD,
          { commander: "legal" },
          "Creature — Human",
          ["B"],
        ),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    expect(result.legal).toBe(false);
    const violation = result.issues.find(
      (i) => i.code === "color_identity_violation",
    );
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("Wrath of God");
    expect(violation?.message).toContain("{W}");
  });

  it("unions identity across partner commanders", () => {
    // W/B + G/U partners → W/U/B/G; a U card should be legal, and an R card flagged.
    const cards: MinimalDeckCard[] = [
      makeDeckCard(
        "Tymna the Weaver",
        1,
        Zone.COMMANDER,
        { commander: "legal" },
        "Legendary Creature — Human Cleric",
        ["W", "B"],
      ),
      makeDeckCard(
        "Thrasios, Triton Hero",
        1,
        Zone.COMMANDER,
        { commander: "legal" },
        "Legendary Creature — Merfolk Wizard",
        ["G", "U"],
      ),
      makeDeckCard(
        "Counterspell",
        1,
        Zone.MAINBOARD,
        { commander: "legal" },
        "Instant",
        ["U"],
      ),
      makeDeckCard(
        "Lightning Bolt",
        1,
        Zone.MAINBOARD,
        { commander: "legal" },
        "Instant",
        ["R"],
      ),
      ...Array.from({ length: 96 }, (_, i) =>
        makeDeckCard(
          `Unique Card ${i}`,
          1,
          Zone.MAINBOARD,
          { commander: "legal" },
          "Creature — Human",
          ["W"],
        ),
      ),
    ];
    const deck = makeDeck(Format.COMMANDER, cards);
    const result = validateDeck(deck);
    const violations = result.issues.filter(
      (i) => i.code === "color_identity_violation",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("Lightning Bolt");
    expect(violations[0]?.message).toContain("{R}");
  });
});

// ---------------------------------------------------------------------------
// getCardLegalityForDeck — color identity
// ---------------------------------------------------------------------------

describe("getCardLegalityForDeck — color identity", () => {
  it("flags an off-color card when commanderIdentity is provided", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Wrath of God",
        legalities: { commander: "legal" },
        typeLine: "Sorcery",
        colorIdentity: ["W"],
      },
      format: Format.COMMANDER,
      currentCopiesInDeck: 0,
      commanderIdentity: ["B", "G"],
    });
    expect(result.legal).toBe(false);
    expect(
      result.reasons.some((r) => r.includes("color identity") && r.includes("{W}")),
    ).toBe(true);
  });

  it("treats an off-color card as legal when commanderIdentity is not provided", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Wrath of God",
        legalities: { commander: "legal" },
        typeLine: "Sorcery",
        colorIdentity: ["W"],
      },
      format: Format.COMMANDER,
      currentCopiesInDeck: 0,
    });
    expect(result.legal).toBe(true);
  });

  it("does not apply color identity rule in non-identity formats", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Wrath of God",
        legalities: { standard: "legal" },
        typeLine: "Sorcery",
        colorIdentity: ["W"],
      },
      format: Format.STANDARD,
      currentCopiesInDeck: 0,
      commanderIdentity: ["B", "G"],
    });
    expect(result.legal).toBe(true);
  });

  it("allows a colorless card in a mono-color deck", () => {
    const result = getCardLegalityForDeck({
      card: {
        name: "Sol Ring",
        legalities: { commander: "legal" },
        typeLine: "Artifact",
        colorIdentity: [],
      },
      format: Format.COMMANDER,
      currentCopiesInDeck: 0,
      commanderIdentity: ["B"],
    });
    expect(result.legal).toBe(true);
  });
});
