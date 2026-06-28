import { describe, expect, it } from "vitest";
import {
  computeAverageMV,
  computeAverageMVRaw,
  computeColorPips,
  computeColorPipsRaw,
  computeManaCurve,
  computeManaCurveRaw,
  computeTypeBreakdown,
  countLands,
  expectedLandsInHand,
  filterByTypes,
  formatTargets,
  type DeckCardWithRelations,
} from "../compute";
import { type Card, type DeckCard } from "@/lib/generated/prisma/browser";
import { type CardType, Format, type Zone } from "@/lib/generated/prisma/enums";

let _id = 0;
function makeCard(overrides: Partial<Card>): Card {
  return {
    id: ++_id,
    name: `Card ${_id}`,
    mainType: "Creature",
    typeLine: "Creature — Human",
    oracleText: null,
    manaCost: null,
    cmc: 0,
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
  } as unknown as Card;
}

function makeDeckCard(
  card: Card,
  overrides: Partial<DeckCard> & {
    zone?: Zone;
    category?: string | null;
    quantity?: number;
  } = {},
): DeckCardWithRelations {
  return {
    id: `dc-${card.id}`,
    deckId: "deck-1",
    cardId: card.id,
    quantity: overrides.quantity ?? 1,
    zone: overrides.zone ?? "MAINBOARD",
    category: overrides.category ?? null,
    printingId: null,
    isFoil: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    card,
    printing: null,
    ...overrides,
  } as DeckCardWithRelations;
}

describe("computeManaCurve", () => {
  it("returns all-zero buckets for empty deck", () => {
    const curve = computeManaCurve([]);
    expect(curve).toEqual({
      "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7+": 0,
    });
  });

  it("excludes lands from the curve", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land — Forest", cmc: 0 });
    const creature = makeCard({ mainType: "Creature", cmc: 2 });
    const cards = [makeDeckCard(land, { quantity: 24 }), makeDeckCard(creature, { quantity: 4 })];
    const curve = computeManaCurve(cards);
    expect(curve["0"]).toBe(0);
    expect(curve["2"]).toBe(4);
  });

  it("buckets 7+ correctly", () => {
    const bigSpell = makeCard({ mainType: "Sorcery", cmc: 10 });
    const curve = computeManaCurve([makeDeckCard(bigSpell, { quantity: 3 })]);
    expect(curve["7+"]).toBe(3);
  });

  it("counts quantity for each card", () => {
    const bolt = makeCard({ mainType: "Instant", cmc: 1 });
    const curve = computeManaCurve([makeDeckCard(bolt, { quantity: 4 })]);
    expect(curve["1"]).toBe(4);
  });

  it("excludes SIDEBOARD and CONSIDERING zones", () => {
    const spell = makeCard({ mainType: "Instant", cmc: 2 });
    const cards = [
      makeDeckCard(spell, { quantity: 4, zone: "SIDEBOARD" }),
      makeDeckCard(spell, { quantity: 2, zone: "CONSIDERING" }),
    ];
    const curve = computeManaCurve(cards);
    expect(curve["2"]).toBe(0);
  });

  it("includes COMMANDER zone in the curve", () => {
    const commander = makeCard({ mainType: "Creature", cmc: 4 });
    const curve = computeManaCurve([makeDeckCard(commander, { quantity: 1, zone: "COMMANDER" })]);
    expect(curve["4"]).toBe(1);
  });
});

describe("filterByTypes", () => {
  const creature = makeCard({ mainType: "Creature", cmc: 2 });
  const instant = makeCard({ mainType: "Instant", cmc: 1 });
  const land = makeCard({ mainType: "Land", typeLine: "Basic Land — Forest", cmc: 0 });
  const cards = [
    makeDeckCard(creature, { quantity: 4 }),
    makeDeckCard(instant, { quantity: 3 }),
    makeDeckCard(land, { quantity: 24 }),
  ];

  it("returns the list unchanged for an empty type filter", () => {
    expect(filterByTypes(cards, [])).toBe(cards);
  });

  it("keeps only cards whose mainType matches", () => {
    const result = filterByTypes(cards, ["Creature"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.card.mainType).toBe("Creature");
  });

  it("supports selecting multiple types", () => {
    const result = filterByTypes(cards, ["Creature", "Instant"]);
    expect(result).toHaveLength(2);
    expect(result.map((dc) => dc.card.mainType)).toEqual(["Creature", "Instant"]);
  });

  it("returns nothing when no card matches the filter", () => {
    expect(filterByTypes(cards, ["Planeswalker"])).toHaveLength(0);
  });

  it("scopes the mana curve to the selected type", () => {
    const curve = computeManaCurve(filterByTypes(cards, ["Creature"]));
    expect(curve["2"]).toBe(4);
    expect(curve["1"]).toBe(0);
  });

  it("respects the CardType type for the filter argument", () => {
    const types: CardType[] = ["Creature"];
    expect(filterByTypes(cards, types)).toHaveLength(1);
  });
});

describe("computeColorPips", () => {
  it("returns zero pips for empty deck", () => {
    expect(computeColorPips([])).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it("counts mono-color pips correctly", () => {
    const bolt = makeCard({ mainType: "Instant", manaCost: "{R}" });
    const pips = computeColorPips([makeDeckCard(bolt, { quantity: 4 })]);
    expect(pips.R).toBe(4);
  });

  it("counts multiple pips in one card", () => {
    const fireball = makeCard({ mainType: "Instant", manaCost: "{X}{R}{R}" });
    const pips = computeColorPips([makeDeckCard(fireball, { quantity: 1 })]);
    expect(pips.R).toBe(2);
  });

  it("counts multicolor card pips", () => {
    const card = makeCard({ mainType: "Instant", manaCost: "{2}{W}{U}" });
    const pips = computeColorPips([makeDeckCard(card, { quantity: 2 })]);
    expect(pips.W).toBe(2);
    expect(pips.U).toBe(2);
    expect(pips.R).toBe(0);
  });

  it("handles hybrid pips as 0.5 each color", () => {
    const hybrid = makeCard({ mainType: "Creature", manaCost: "{R/G}{R/G}" });
    const pips = computeColorPips([makeDeckCard(hybrid, { quantity: 1 })]);
    expect(pips.R).toBe(1);
    expect(pips.G).toBe(1);
  });

  it("ignores X and generic mana", () => {
    const xSpell = makeCard({ mainType: "Sorcery", manaCost: "{X}{X}{G}" });
    const pips = computeColorPips([makeDeckCard(xSpell, { quantity: 1 })]);
    expect(pips.G).toBe(1);
    expect(pips.W + pips.U + pips.B + pips.R).toBe(0);
  });

  it("counts Phyrexian pip {W/P} at full weight (1.0)", () => {
    // {W/P} is castable with W mana or 2 life; manabase still needs white sources
    const card = makeCard({ mainType: "Instant", manaCost: "{W/P}" });
    const pips = computeColorPips([makeDeckCard(card, { quantity: 2 })]);
    expect(pips.W).toBe(2);
    expect(pips.U + pips.B + pips.R + pips.G + pips.C).toBe(0);
  });

  it("counts twobrid pip {2/G} at 0.5 weight", () => {
    // {2/G} can be paid with 2 generic or 1 green; soft color dependency
    const card = makeCard({ mainType: "Creature", manaCost: "{2/G}{2/G}" });
    const pips = computeColorPips([makeDeckCard(card, { quantity: 1 })]);
    expect(pips.G).toBe(1); // 2 × 0.5
    expect(pips.W + pips.U + pips.B + pips.R + pips.C).toBe(0);
  });

  it("pure generic {2} contributes nothing to any color", () => {
    const card = makeCard({ mainType: "Creature", manaCost: "{2}{2}" });
    const pips = computeColorPips([makeDeckCard(card, { quantity: 3 })]);
    expect(pips).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it("handles mixed Phyrexian + mono + twobrid in one cost", () => {
    // e.g. {U/P}{2/R}{B} — U full, R 0.5, B full
    const card = makeCard({ mainType: "Instant", manaCost: "{U/P}{2/R}{B}" });
    const pips = computeColorPips([makeDeckCard(card, { quantity: 1 })]);
    expect(pips.U).toBe(1);
    expect(pips.R).toBeCloseTo(0.5);
    expect(pips.B).toBe(1);
    expect(pips.W + pips.G + pips.C).toBe(0);
  });

  it("excludes SIDEBOARD and CONSIDERING zones", () => {
    const bolt = makeCard({ mainType: "Instant", manaCost: "{R}" });
    const cards = [
      makeDeckCard(bolt, { quantity: 4, zone: "SIDEBOARD" }),
    ];
    const pips = computeColorPips(cards);
    expect(pips.R).toBe(0);
  });

  it("includes COMMANDER pips", () => {
    const commander = makeCard({ mainType: "Creature", manaCost: "{B}{B}" });
    const pips = computeColorPips([makeDeckCard(commander, { quantity: 1, zone: "COMMANDER" })]);
    expect(pips.B).toBe(2);
  });

  it("skips cards with no mana cost (e.g. lands without printed cost)", () => {
    const noCost = makeCard({ mainType: "Creature", manaCost: null });
    const pips = computeColorPips([makeDeckCard(noCost, { quantity: 3 })]);
    expect(pips).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });
});

describe("computeTypeBreakdown", () => {
  it("returns empty object for empty deck", () => {
    expect(computeTypeBreakdown([])).toEqual({});
  });

  it("groups by mainType summing quantity", () => {
    const creature = makeCard({ mainType: "Creature" });
    const spell = makeCard({ mainType: "Instant" });
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land" });
    const cards = [
      makeDeckCard(creature, { quantity: 20 }),
      makeDeckCard(spell, { quantity: 8 }),
      makeDeckCard(land, { quantity: 24 }),
    ];
    const breakdown = computeTypeBreakdown(cards);
    expect(breakdown["Creature"]).toBe(20);
    expect(breakdown["Instant"]).toBe(8);
    expect(breakdown["Land"]).toBe(24);
  });

  it("includes lands in the breakdown", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land" });
    const breakdown = computeTypeBreakdown([makeDeckCard(land, { quantity: 24 })]);
    expect(breakdown["Land"]).toBe(24);
  });

  it("excludes SIDEBOARD and CONSIDERING zones", () => {
    const creature = makeCard({ mainType: "Creature" });
    const cards = [
      makeDeckCard(creature, { quantity: 4, zone: "SIDEBOARD" }),
      makeDeckCard(creature, { quantity: 2, zone: "CONSIDERING" }),
    ];
    expect(computeTypeBreakdown(cards)).toEqual({});
  });
});

describe("computeAverageMV", () => {
  it("returns 0 for empty deck", () => {
    expect(computeAverageMV([])).toBe(0);
  });

  it("returns 0 for all-land deck", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land", cmc: 0 });
    expect(computeAverageMV([makeDeckCard(land, { quantity: 40 })])).toBe(0);
  });

  it("calculates correctly for typical mix", () => {
    const a = makeCard({ mainType: "Instant", cmc: 1 });
    const b = makeCard({ mainType: "Sorcery", cmc: 2 });
    const avg = computeAverageMV([
      makeDeckCard(a, { quantity: 4 }),
      makeDeckCard(b, { quantity: 4 }),
    ]);
    expect(avg).toBe(1.5);
  });

  it("excludes lands from average", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land", cmc: 0 });
    const spell = makeCard({ mainType: "Instant", cmc: 2 });
    const avg = computeAverageMV([
      makeDeckCard(land, { quantity: 20 }),
      makeDeckCard(spell, { quantity: 4 }),
    ]);
    expect(avg).toBe(2);
  });

  it("handles X spells (cmc 0 when X=0)", () => {
    const xSpell = makeCard({ mainType: "Sorcery", cmc: 0, manaCost: "{X}{G}" });
    const spell = makeCard({ mainType: "Instant", cmc: 1 });
    const avg = computeAverageMV([
      makeDeckCard(xSpell, { quantity: 1 }),
      makeDeckCard(spell, { quantity: 1 }),
    ]);
    expect(avg).toBe(0.5);
  });
});

describe("expectedLandsInHand", () => {
  it("returns 0 for empty deck", () => {
    expect(expectedLandsInHand([])).toBe(0);
  });

  it("returns 0 for deck with no lands", () => {
    const spell = makeCard({ mainType: "Instant", cmc: 1 });
    expect(expectedLandsInHand([makeDeckCard(spell, { quantity: 60 })])).toBe(0);
  });

  it("calculates hypergeometric EV correctly for 60-card deck", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land", cmc: 0 });
    const spell = makeCard({ mainType: "Instant", cmc: 1 });
    const result = expectedLandsInHand([
      makeDeckCard(land, { quantity: 24 }),
      makeDeckCard(spell, { quantity: 36 }),
    ]);
    expect(result).toBeCloseTo(2.8, 5);
  });

  it("excludes SIDEBOARD from land count and deck size", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land", cmc: 0 });
    const spell = makeCard({ mainType: "Instant", cmc: 1 });
    const cards = [
      makeDeckCard(land, { quantity: 24 }),
      makeDeckCard(spell, { quantity: 36 }),
      makeDeckCard(land, { quantity: 10, zone: "SIDEBOARD" }),
    ];
    const result = expectedLandsInHand(cards);
    expect(result).toBeCloseTo(2.8, 5);
  });

  it("respects custom hand size", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land", cmc: 0 });
    const spell = makeCard({ mainType: "Instant", cmc: 1 });
    const result = expectedLandsInHand([
      makeDeckCard(land, { quantity: 24 }),
      makeDeckCard(spell, { quantity: 36 }),
    ], 4);
    expect(result).toBeCloseTo(1.6, 5);
  });
});

describe("countLands", () => {
  it("counts lands by typeLine as well", () => {
    const nonbasic = makeCard({ mainType: "Land", typeLine: "Land — Shock Land", cmc: 0 });
    expect(countLands([makeDeckCard(nonbasic, { quantity: 4 })])).toBe(4);
  });

  it("excludes SIDEBOARD lands", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land" });
    expect(countLands([makeDeckCard(land, { quantity: 15, zone: "SIDEBOARD" })])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Raw helpers — pre-scoped slice, no zone filtering applied internally
// ---------------------------------------------------------------------------

describe("computeManaCurveRaw", () => {
  it("counts SIDEBOARD cards since no zone filter is applied", () => {
    const spell = makeCard({ mainType: "Instant", cmc: 2 });
    const curve = computeManaCurveRaw([makeDeckCard(spell, { quantity: 3, zone: "SIDEBOARD" })]);
    expect(curve["2"]).toBe(3);
  });

  it("produces same result as computeManaCurve for MAINBOARD-only input", () => {
    const a = makeCard({ mainType: "Instant", cmc: 1 });
    const b = makeCard({ mainType: "Sorcery", cmc: 3 });
    const cards = [
      makeDeckCard(a, { quantity: 4, zone: "MAINBOARD" }),
      makeDeckCard(b, { quantity: 2, zone: "MAINBOARD" }),
    ];
    expect(computeManaCurveRaw(cards)).toEqual(computeManaCurve(cards));
  });

  it("excludes lands even without zone filter", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land", cmc: 0 });
    const spell = makeCard({ mainType: "Creature", cmc: 2 });
    const cards = [makeDeckCard(land, { quantity: 20 }), makeDeckCard(spell, { quantity: 4 })];
    const curve = computeManaCurveRaw(cards);
    expect(curve["0"]).toBe(0);
    expect(curve["2"]).toBe(4);
  });

  it("returns all-zero buckets for empty input", () => {
    expect(computeManaCurveRaw([])).toEqual({
      "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7+": 0,
    });
  });
});

describe("computeColorPipsRaw", () => {
  it("counts pips regardless of zone", () => {
    const bolt = makeCard({ mainType: "Instant", manaCost: "{R}" });
    const cards = [makeDeckCard(bolt, { quantity: 4, zone: "SIDEBOARD" })];
    const pips = computeColorPipsRaw(cards);
    expect(pips.R).toBe(4);
  });

  it("produces same result as computeColorPips for MAINBOARD-only input", () => {
    const spell = makeCard({ mainType: "Instant", manaCost: "{2}{W}{U}" });
    const cards = [makeDeckCard(spell, { quantity: 2, zone: "MAINBOARD" })];
    expect(computeColorPipsRaw(cards)).toEqual(computeColorPips(cards));
  });

  it("returns zero pips for empty input", () => {
    expect(computeColorPipsRaw([])).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });
});

describe("computeAverageMVRaw", () => {
  it("includes cards from any zone", () => {
    const spell = makeCard({ mainType: "Instant", cmc: 3 });
    const avg = computeAverageMVRaw([makeDeckCard(spell, { quantity: 1, zone: "CONSIDERING" })]);
    expect(avg).toBe(3);
  });

  it("produces same result as computeAverageMV for MAINBOARD-only input", () => {
    const a = makeCard({ mainType: "Instant", cmc: 1 });
    const b = makeCard({ mainType: "Sorcery", cmc: 3 });
    const cards = [
      makeDeckCard(a, { quantity: 4, zone: "MAINBOARD" }),
      makeDeckCard(b, { quantity: 4, zone: "MAINBOARD" }),
    ];
    expect(computeAverageMVRaw(cards)).toBe(computeAverageMV(cards));
  });

  it("returns 0 for empty input", () => {
    expect(computeAverageMVRaw([])).toBe(0);
  });

  it("excludes lands from average even without zone filter", () => {
    const land = makeCard({ mainType: "Land", typeLine: "Basic Land", cmc: 0 });
    const spell = makeCard({ mainType: "Instant", cmc: 2 });
    const avg = computeAverageMVRaw([
      makeDeckCard(land, { quantity: 20 }),
      makeDeckCard(spell, { quantity: 4 }),
    ]);
    expect(avg).toBe(2);
  });
});

describe("isLand edges (via curve/avg)", () => {
  it("treats a card with typeLine=null as non-land (mainType decides)", () => {
    const spell = makeCard({
      mainType: "Instant",
      typeLine: null,
      cmc: 3,
    });
    const curve = computeManaCurveRaw([makeDeckCard(spell, { quantity: 2 })]);
    expect(curve["3"]).toBe(2);
  });

  it("treats a card with cmc=null as 0 in curve and avg", () => {
    const spell = makeCard({ mainType: "Instant", cmc: null });
    const curve = computeManaCurveRaw([makeDeckCard(spell, { quantity: 1 })]);
    expect(curve["0"]).toBe(1);
    const avg = computeAverageMVRaw([makeDeckCard(spell, { quantity: 1 })]);
    expect(avg).toBe(0);
  });
});

describe("formatTargets", () => {
  it("returns 100/36 for COMMANDER", () => {
    expect(formatTargets(Format.COMMANDER)).toEqual({
      requiredCards: 100,
      targetLands: 36,
    });
  });

  it("returns 100/36 for OATHBREAKER", () => {
    expect(formatTargets(Format.OATHBREAKER)).toEqual({
      requiredCards: 100,
      targetLands: 36,
    });
  });

  it("returns 60/24 for BRAWL", () => {
    expect(formatTargets(Format.BRAWL)).toEqual({
      requiredCards: 60,
      targetLands: 24,
    });
  });

  it("falls through to 60/24 for any other format (e.g. STANDARD)", () => {
    expect(formatTargets(Format.STANDARD)).toEqual({
      requiredCards: 60,
      targetLands: 24,
    });
  });
});
