import { describe, expect, it } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";
import { jsonAdapter, MaindeckJsonSchema } from "../json";
import { toMaindeckJson } from "../../serialize";
import type { DeckWithCards } from "../types";

function makeDeck(overrides: Partial<DeckWithCards> = {}): DeckWithCards {
  return {
    name: "Test Deck",
    format: "COMMANDER",
    visibility: "PRIVATE",
    description: null,
    cards: [
      {
        quantity: 1,
        zone: Zone.COMMANDER,
        categories: [],
        isFoil: false,
        printingId: null,
        card: { name: "Atraxa, Praetors' Voice" },
        printing: null,
      },
      {
        quantity: 4,
        zone: Zone.MAINBOARD,
        categories: ["ramp"],
        isFoil: true,
        printingId: 999,
        card: { name: "Sol Ring" },
        printing: { setCode: "C21", collectorNumber: "263" },
      },
      {
        quantity: 2,
        zone: Zone.SIDEBOARD,
        categories: [],
        isFoil: false,
        printingId: null,
        card: { name: "Duress" },
        printing: null,
      },
      {
        quantity: 1,
        zone: Zone.CONSIDERING,
        categories: [],
        isFoil: false,
        printingId: null,
        card: { name: "Brainstorm" },
        printing: null,
      },
    ],
    categories: [{ name: "ramp", sortOrder: 0 }],
    ...overrides,
  };
}

describe("jsonAdapter.detect", () => {
  it("returns 1 for JSON objects", () => {
    expect(jsonAdapter.detect('{"name":"Test"}')).toBe(1);
    expect(jsonAdapter.detect('  { "foo": 1 }')).toBe(1);
  });

  it("returns 0 for non-JSON input", () => {
    expect(jsonAdapter.detect("4 Lightning Bolt")).toBe(0);
    expect(jsonAdapter.detect("<Deck/>")).toBe(0);
    expect(jsonAdapter.detect("Deck\n4 Lightning Bolt")).toBe(0);
  });
});

describe("jsonAdapter.parse — round-trip fidelity", () => {
  it("round-trips toMaindeckJson output preserving zones, categories, and foil", () => {
    const deck = makeDeck();
    const json = toMaindeckJson(deck);
    const result = jsonAdapter.parse(json);

    expect(result.format).toBe("json");
    expect(result.warnings).toHaveLength(0);
    expect(result.cards).toHaveLength(4);

    const commander = result.cards.find((c) => c.zone === Zone.COMMANDER);
    expect(commander).toMatchObject({
      name: "Atraxa, Praetors' Voice",
      quantity: 1,
      zone: Zone.COMMANDER,
      isFoil: false,
      categories: [],
    });

    const solRing = result.cards.find((c) => c.name === "Sol Ring");
    expect(solRing).toMatchObject({
      quantity: 4,
      zone: Zone.MAINBOARD,
      categories: ["ramp"],
      isFoil: true,
      set: "C21",
      collectorNumber: "263",
    });

    const sideboard = result.cards.find((c) => c.zone === Zone.SIDEBOARD);
    expect(sideboard).toMatchObject({ name: "Duress", quantity: 2 });

    const considering = result.cards.find((c) => c.zone === Zone.CONSIDERING);
    expect(considering).toMatchObject({ name: "Brainstorm", quantity: 1 });
  });

  it("round-trips a multi-category card preserving membership order ([0] = primary)", () => {
    const deck = makeDeck({
      cards: [
        {
          quantity: 1,
          zone: Zone.MAINBOARD,
          categories: ["ramp", "artifacts", "win-cons"],
          isFoil: false,
          printingId: null,
          card: { name: "Sol Ring" },
          printing: null,
        },
      ],
      categories: [
        { name: "ramp", sortOrder: 0 },
        { name: "artifacts", sortOrder: 1 },
        { name: "win-cons", sortOrder: 2 },
      ],
    });

    const result = jsonAdapter.parse(toMaindeckJson(deck));

    expect(result.warnings).toHaveLength(0);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      name: "Sol Ring",
      categories: ["ramp", "artifacts", "win-cons"],
    });
  });
});

describe("jsonAdapter.parse — non-MAINBOARD categories", () => {
  it("drops categories on a sideboard card with a warning instead of failing the batch", () => {
    const result = jsonAdapter.parse(
      JSON.stringify({
        name: "Deck",
        format: "COMMANDER",
        visibility: "PRIVATE",
        description: null,
        cards: [
          {
            name: "Duress",
            quantity: 2,
            zone: Zone.SIDEBOARD,
            isFoil: false,
            categories: ["discard"],
          },
          {
            name: "Sol Ring",
            quantity: 1,
            zone: Zone.MAINBOARD,
            isFoil: false,
            categories: ["ramp"],
          },
        ],
        categories: [{ name: "ramp", sortOrder: 0 }],
      }),
    );

    expect(result.cards).toHaveLength(2);
    expect(result.cards.find((c) => c.name === "Duress")).toMatchObject({
      zone: Zone.SIDEBOARD,
      categories: [],
    });
    expect(result.cards.find((c) => c.name === "Sol Ring")).toMatchObject({
      categories: ["ramp"],
    });
    expect(result.warnings).toEqual([
      `Ignored categories on "Duress": SIDEBOARD cards can't have categories`,
    ]);
  });
});

describe("jsonAdapter.parse — category registry", () => {
  it("carries the export's registry through, normalized and in sortOrder order", () => {
    const result = jsonAdapter.parse(
      JSON.stringify({
        name: "Deck",
        format: "COMMANDER",
        visibility: "PRIVATE",
        description: null,
        cards: [],
        categories: [
          { name: "  Removal ", sortOrder: 2 },
          { name: "Ramp", sortOrder: 0 },
          { name: "empty-bucket", sortOrder: 1 },
          { name: "ramp", sortOrder: 3 }, // dupe post-normalization
          { name: "   ", sortOrder: 4 }, // blank → dropped
        ],
      }),
    );

    expect(result.categoryRegistry).toEqual([
      { name: "ramp", sortOrder: 0 },
      { name: "empty-bucket", sortOrder: 1 },
      { name: "removal", sortOrder: 2 },
    ]);
  });

  it("caps category names at CATEGORY_NAME_MAX via schema validation", () => {
    const result = jsonAdapter.parse(
      JSON.stringify({
        name: "Deck",
        format: "COMMANDER",
        visibility: "PRIVATE",
        description: null,
        cards: [
          {
            name: "Sol Ring",
            quantity: 1,
            zone: Zone.MAINBOARD,
            isFoil: false,
            categories: ["x".repeat(51)],
          },
        ],
        categories: [],
      }),
    );

    expect(result.cards).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/failed validation/);
  });
});

describe("jsonAdapter.parse — category normalization", () => {
  it("lowercases, trims, and dedupes category names preserving first-seen order", () => {
    const result = jsonAdapter.parse(
      JSON.stringify({
        name: "Deck",
        format: "commander",
        visibility: "PRIVATE",
        description: null,
        cards: [
          {
            name: "Sol Ring",
            quantity: 1,
            zone: Zone.MAINBOARD,
            categories: [" Ramp ", "ramp", "Artifacts", ""],
            isFoil: false,
          },
        ],
        categories: [],
      }),
    );

    expect(result.warnings).toHaveLength(0);
    expect(result.cards[0]!.categories).toEqual(["ramp", "artifacts"]);
  });
});

describe("jsonAdapter.parse — legacy single-category payloads", () => {
  it("parses a legacy card with category string into a one-element categories array", () => {
    const result = jsonAdapter.parse(
      JSON.stringify({
        name: "Deck",
        format: "commander",
        visibility: "PRIVATE",
        description: null,
        cards: [
          {
            name: "Sol Ring",
            quantity: 1,
            zone: Zone.MAINBOARD,
            category: "Ramp",
            isFoil: false,
          },
        ],
        categories: [{ name: "ramp", sortOrder: 0 }],
      }),
    );

    expect(result.warnings).toHaveLength(0);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]!.categories).toEqual(["ramp"]);
  });

  it("parses a legacy card with category null into an empty categories array", () => {
    const result = jsonAdapter.parse(
      JSON.stringify({
        name: "Deck",
        format: "commander",
        visibility: "PRIVATE",
        description: null,
        cards: [
          {
            name: "Duress",
            quantity: 2,
            zone: Zone.SIDEBOARD,
            category: null,
            isFoil: false,
          },
        ],
        categories: [],
      }),
    );

    expect(result.warnings).toHaveLength(0);
    expect(result.cards[0]!.categories).toEqual([]);
  });
});

describe("jsonAdapter.parse — error handling", () => {
  it("returns 0 cards and a warning for malformed JSON without throwing", () => {
    const result = jsonAdapter.parse("{not valid json");
    expect(result.cards).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("JSON");
  });

  it("returns 0 cards and a warning for valid JSON that fails schema validation", () => {
    const result = jsonAdapter.parse(JSON.stringify({ totally: "wrong shape" }));
    expect(result.cards).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("validation");
  });

  it("returns 0 cards and a warning for a JSON array (not an object)", () => {
    const result = jsonAdapter.parse(JSON.stringify([1, 2, 3]));
    expect(result.cards).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects a card whose quantity exceeds the max without throwing", () => {
    const result = jsonAdapter.parse(
      JSON.stringify({
        name: "Deck",
        format: "commander",
        visibility: "PRIVATE",
        description: null,
        cards: [
          {
            name: "Sol Ring",
            quantity: 999999,
            zone: Zone.MAINBOARD,
            categories: [],
            isFoil: false,
          },
        ],
        categories: [],
      }),
    );
    expect(result.cards).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("validation");
  });
});

describe("MaindeckJsonSchema", () => {
  it("accepts a valid MaindeckJson payload", () => {
    const deck = makeDeck();
    const raw = JSON.parse(toMaindeckJson(deck));
    expect(MaindeckJsonSchema.safeParse(raw).success).toBe(true);
  });
});
