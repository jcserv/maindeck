import { describe, expect, it } from "vitest";
import { evaluateParsedWhere } from "../evaluate-where";
import type { ParsedWhere } from "../syntax-parser";
import type { DeckCard } from "@/lib/deck/zone-view";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsed(overrides: Partial<ParsedWhere> = {}): ParsedWhere {
  return {
    nameFragments: [],
    colors: [],
    typeFragments: [],
    cmcFilters: [],
    oracleFragments: [],
    ...overrides,
  };
}

/**
 * Minimal DeckCard stub — only the card fields exercised by evaluateParsedWhere
 * are set. Prisma-generated relations/ids are filled with safe defaults.
 */
function makeDeckCard(card: {
  name: string;
  typeLine?: string | null;
  oracleText?: string | null;
  cmc?: number | null;
  colors?: string[];
  colorIdentity?: string[];
}): DeckCard {
  return {
    id: "dc-1",
    deckId: "deck-1",
    cardId: "card-1",
    quantity: 1,
    zone: "MAINBOARD",
    category: null,
    printingId: null,
    isFoil: false,
    printing: null,
    card: {
      id: 1,
      name: card.name,
      mainType: "CREATURE",
      typeLine: card.typeLine ?? null,
      oracleText: card.oracleText ?? null,
      manaCost: null,
      cmc: card.cmc ?? 0,
      colors: card.colors ?? [],
      colorIdentity: card.colorIdentity ?? card.colors ?? [],
      legalities: {},
      gameChanger: false,
      printings: [],
    },
  } as unknown as DeckCard;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluateParsedWhere", () => {
  // ---- bare name fragment --------------------------------------------------

  describe("nameFragments (bare word / quoted name)", () => {
    it("matches a substring of the card name (case-insensitive)", () => {
      const dc = makeDeckCard({ name: "Lightning Bolt" });
      expect(evaluateParsedWhere(dc, parsed({ nameFragments: ["lightning"] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ nameFragments: ["BOLT"] }))).toBe(true);
    });

    it("does not match when the fragment is absent", () => {
      const dc = makeDeckCard({ name: "Lightning Bolt" });
      expect(evaluateParsedWhere(dc, parsed({ nameFragments: ["counterspell"] }))).toBe(false);
    });

    it("ANDs multiple name fragments", () => {
      const dc = makeDeckCard({ name: "Lightning Bolt" });
      expect(evaluateParsedWhere(dc, parsed({ nameFragments: ["lightning", "bolt"] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ nameFragments: ["lightning", "storm"] }))).toBe(false);
    });

    it("handles a quoted name fragment (multi-word substring)", () => {
      const dc = makeDeckCard({ name: "Sol Ring" });
      expect(evaluateParsedWhere(dc, parsed({ nameFragments: ["Sol Ring"] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ nameFragments: ["Sol Stone"] }))).toBe(false);
    });
  });

  // ---- c: color ------------------------------------------------------------

  describe("colors (c: operator)", () => {
    it("matches when card.colors contains all specified colors", () => {
      const dc = makeDeckCard({ name: "Counterspell", colors: ["U"] });
      expect(evaluateParsedWhere(dc, parsed({ colors: ["U"] }))).toBe(true);
    });

    it("does not match when a required color is missing", () => {
      const dc = makeDeckCard({ name: "Counterspell", colors: ["U"] });
      expect(evaluateParsedWhere(dc, parsed({ colors: ["W"] }))).toBe(false);
    });

    it("matches a multicolor card against a multicolor filter (c:wu)", () => {
      const dc = makeDeckCard({ name: "Azorius Charm", colors: ["W", "U"] });
      expect(evaluateParsedWhere(dc, parsed({ colors: ["W", "U"] }))).toBe(true);
    });

    it("does not match a monocolor card against a multicolor filter", () => {
      const dc = makeDeckCard({ name: "Azorius Charm", colors: ["W", "U"] });
      expect(evaluateParsedWhere(dc, parsed({ colors: ["W", "U", "R"] }))).toBe(false);
    });

    it("is case-insensitive for the color letter", () => {
      const dc = makeDeckCard({ name: "Birds of Paradise", colors: ["G"] });
      expect(evaluateParsedWhere(dc, parsed({ colors: ["g"] }))).toBe(true);
    });
  });

  // ---- t: type -------------------------------------------------------------

  describe("typeFragments (t: operator)", () => {
    it("matches a type fragment in the type line (case-insensitive)", () => {
      const dc = makeDeckCard({ name: "Grizzly Bears", typeLine: "Creature — Bear" });
      expect(evaluateParsedWhere(dc, parsed({ typeFragments: ["creature"] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ typeFragments: ["Creature"] }))).toBe(true);
    });

    it("does not match when the type fragment is absent", () => {
      const dc = makeDeckCard({ name: "Lightning Bolt", typeLine: "Instant" });
      expect(evaluateParsedWhere(dc, parsed({ typeFragments: ["creature"] }))).toBe(false);
    });

    it("ANDs multiple type fragments", () => {
      const dc = makeDeckCard({ name: "Vendilion Clique", typeLine: "Legendary Creature — Faerie Wizard" });
      expect(evaluateParsedWhere(dc, parsed({ typeFragments: ["legendary", "wizard"] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ typeFragments: ["legendary", "instant"] }))).toBe(false);
    });

    it("returns true for any card when typeFragments is empty", () => {
      const dc = makeDeckCard({ name: "Sol Ring", typeLine: "Artifact" });
      expect(evaluateParsedWhere(dc, parsed({ typeFragments: [] }))).toBe(true);
    });

    it("handles null typeLine — no match when fragments are present", () => {
      const dc = makeDeckCard({ name: "Unknown Card", typeLine: null });
      expect(evaluateParsedWhere(dc, parsed({ typeFragments: ["creature"] }))).toBe(false);
    });
  });

  // ---- cmc comparators -----------------------------------------------------

  describe("cmcFilters (cmc: operator)", () => {
    it("cmc= matches equal cmc", () => {
      const dc = makeDeckCard({ name: "Bolt", cmc: 1 });
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: "=", value: 1 }] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: "=", value: 2 }] }))).toBe(false);
    });

    it("cmc<= matches less-than-or-equal cmc", () => {
      const dc = makeDeckCard({ name: "Bolt", cmc: 1 });
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: "<=", value: 1 }] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: "<=", value: 0 }] }))).toBe(false);
    });

    it("cmc>= matches greater-than-or-equal cmc", () => {
      const dc = makeDeckCard({ name: "Bolt", cmc: 3 });
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: ">=", value: 3 }] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: ">=", value: 4 }] }))).toBe(false);
    });

    it("cmc< matches strictly less than cmc", () => {
      const dc = makeDeckCard({ name: "Bolt", cmc: 1 });
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: "<", value: 2 }] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: "<", value: 1 }] }))).toBe(false);
    });

    it("cmc> matches strictly greater than cmc", () => {
      const dc = makeDeckCard({ name: "Emrakul", cmc: 15 });
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: ">", value: 14 }] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: ">", value: 15 }] }))).toBe(false);
    });

    it("ANDs multiple cmc filters (e.g. cmc>=2 cmc<=4)", () => {
      const dc = makeDeckCard({ name: "Bolt", cmc: 3 });
      expect(
        evaluateParsedWhere(
          dc,
          parsed({ cmcFilters: [{ op: ">=", value: 2 }, { op: "<=", value: 4 }] }),
        ),
      ).toBe(true);
      expect(
        evaluateParsedWhere(
          dc,
          parsed({ cmcFilters: [{ op: ">=", value: 2 }, { op: "<=", value: 2 }] }),
        ),
      ).toBe(false);
    });

    it("treats null cmc as 0", () => {
      // Bypass the makeDeckCard helper's `?? 0` coercion to exercise the
      // source's `card.cmc ?? 0` fallback directly.
      const dc = {
        id: "dc-1",
        zone: "MAINBOARD",
        card: {
          id: 1,
          name: "Land",
          mainType: "LAND",
          typeLine: null,
          oracleText: null,
          manaCost: null,
          cmc: null,
          colors: [],
          colorIdentity: [],
          legalities: {},
          gameChanger: false,
          printings: [],
        },
      } as unknown as DeckCard;
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: "=", value: 0 }] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ cmcFilters: [{ op: ">", value: 0 }] }))).toBe(false);
    });
  });

  // ---- o: oracle text ------------------------------------------------------

  describe("oracleFragments (o: operator)", () => {
    it("matches a word in oracle text (case-insensitive)", () => {
      const dc = makeDeckCard({ name: "Opt", oracleText: "Look at the top card of your library." });
      expect(evaluateParsedWhere(dc, parsed({ oracleFragments: ["library"] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ oracleFragments: ["LIBRARY"] }))).toBe(true);
    });

    it("does not match when the oracle fragment is absent", () => {
      const dc = makeDeckCard({ name: "Opt", oracleText: "Look at the top card of your library." });
      expect(evaluateParsedWhere(dc, parsed({ oracleFragments: ["draw a card"] }))).toBe(false);
    });

    it("matches a quoted multi-word phrase in oracle text", () => {
      const dc = makeDeckCard({ name: "Brainstorm", oracleText: "Draw three cards, then put two cards from your hand on top of your library in any order." });
      expect(evaluateParsedWhere(dc, parsed({ oracleFragments: ["Draw three"] }))).toBe(true);
    });

    it("ANDs multiple oracle fragments", () => {
      const dc = makeDeckCard({ name: "Counterspell", oracleText: "Counter target spell." });
      expect(evaluateParsedWhere(dc, parsed({ oracleFragments: ["counter", "spell"] }))).toBe(true);
      expect(evaluateParsedWhere(dc, parsed({ oracleFragments: ["counter", "draw"] }))).toBe(false);
    });

    it("handles null oracleText — no match when fragments are present", () => {
      const dc = makeDeckCard({ name: "Basic Land", oracleText: null });
      expect(evaluateParsedWhere(dc, parsed({ oracleFragments: ["draw"] }))).toBe(false);
    });
  });

  // ---- combined query ------------------------------------------------------

  describe("combined query", () => {
    it("passes only cards that satisfy all filter groups simultaneously", () => {
      const bolt = makeDeckCard({
        name: "Lightning Bolt",
        typeLine: "Instant",
        oracleText: "Lightning Bolt deals 3 damage to any target.",
        cmc: 1,
        colors: ["R"],
      });

      // cmc<=1 t:instant c:r o:damage — should match
      expect(
        evaluateParsedWhere(
          bolt,
          parsed({
            cmcFilters: [{ op: "<=", value: 1 }],
            typeFragments: ["instant"],
            colors: ["R"],
            oracleFragments: ["damage"],
          }),
        ),
      ).toBe(true);

      // Same but wrong type — should not match
      expect(
        evaluateParsedWhere(
          bolt,
          parsed({
            cmcFilters: [{ op: "<=", value: 1 }],
            typeFragments: ["creature"],
            colors: ["R"],
            oracleFragments: ["damage"],
          }),
        ),
      ).toBe(false);
    });

    it("empty ParsedWhere matches every card", () => {
      const dc = makeDeckCard({ name: "Any Card", typeLine: "Creature", cmc: 5, colors: ["B"] });
      expect(evaluateParsedWhere(dc, parsed())).toBe(true);
    });
  });
});
