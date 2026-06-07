import { describe, expect, it } from "vitest";
import {
  colorIdentityRule,
  formatColors,
  formatLegalityIssue,
  isBasicLandCard,
  legalityKindForStatus,
  offIdentityColors,
  singletonRule,
} from "../shared";
import { Zone } from "@/lib/generated/prisma/enums";
import type { DeckSnapshot, LegalityIssue } from "@/lib/deck/mutation/types";

describe("formatLegalityIssue", () => {
  it("formats deck_size", () => {
    expect(
      formatLegalityIssue({ kind: "deck_size", expected: 60, actual: 58 }),
    ).toBe("Deck must have exactly 60 cards (currently 58)");
  });

  it("formats no_commander", () => {
    expect(formatLegalityIssue({ kind: "no_commander" })).toBe(
      "Commander decks must have exactly one card in the commander zone",
    );
  });

  it("formats sideboard_size", () => {
    expect(
      formatLegalityIssue({
        kind: "sideboard_size",
        expected: 15,
        actual: 17,
      }),
    ).toBe("Sideboard may have at most 15 cards (currently 17)");
  });

  it("formats card_banned", () => {
    expect(
      formatLegalityIssue({ kind: "card_banned", cardName: "Sol Ring" }),
    ).toBe("Sol Ring: Banned");
  });

  it("formats card_restricted", () => {
    expect(
      formatLegalityIssue({ kind: "card_restricted", cardName: "Brainstorm" }),
    ).toBe("Brainstorm: Restricted");
  });

  it("formats card_not_legal", () => {
    expect(
      formatLegalityIssue({ kind: "card_not_legal", cardName: "Lightning Bolt" }),
    ).toBe("Lightning Bolt: Not legal");
  });

  it("formats singleton_violation", () => {
    expect(
      formatLegalityIssue({
        kind: "singleton_violation",
        cardName: "Sol Ring",
        quantity: 2,
      }),
    ).toBe("Sol Ring: Singleton format — 2 copies in deck");
  });

  it("formats color_identity_violation with offending colors", () => {
    expect(
      formatLegalityIssue({
        kind: "color_identity_violation",
        cardName: "Wrath of God",
        offending: ["W"],
      } satisfies LegalityIssue),
    ).toBe("Wrath of God: Outside commander color identity ({W})");
  });

  it("formats category_zone_mismatch", () => {
    expect(formatLegalityIssue({ kind: "category_zone_mismatch" })).toBe(
      "Subcategories only apply to MAINBOARD cards",
    );
  });
});

describe("legalityKindForStatus", () => {
  it("maps banned/restricted/not_legal to their kinds", () => {
    expect(legalityKindForStatus("banned")).toBe("card_banned");
    expect(legalityKindForStatus("restricted")).toBe("card_restricted");
    expect(legalityKindForStatus("not_legal")).toBe("card_not_legal");
  });

  it("returns null for legal and unknown statuses", () => {
    expect(legalityKindForStatus("legal")).toBeNull();
    expect(legalityKindForStatus("garbage")).toBeNull();
    expect(legalityKindForStatus("")).toBeNull();
  });
});

describe("offIdentityColors", () => {
  it("returns empty array when card has no identity", () => {
    expect(offIdentityColors([], ["W", "U"])).toEqual([]);
    expect(offIdentityColors(null, ["W"])).toEqual([]);
    expect(offIdentityColors(undefined, ["W"])).toEqual([]);
  });

  it("returns colors not in commander identity", () => {
    expect(offIdentityColors(["W", "U", "B"], ["W", "U"])).toEqual(["B"]);
  });

  it("returns empty when card is fully within identity", () => {
    expect(offIdentityColors(["W"], ["W", "U"])).toEqual([]);
  });
});

describe("formatColors", () => {
  it("wraps each color in braces and concatenates", () => {
    expect(formatColors(["W", "U", "B"])).toBe("{W}{U}{B}");
  });

  it("returns empty string for empty input", () => {
    expect(formatColors([])).toBe("");
  });
});

describe("colorIdentityRule", () => {
  function snap(
    cards: Array<{
      cardName: string;
      zone: Zone;
      colorIdentity?: string[] | null;
      typeLine?: string | null;
      quantity?: number;
    }>,
  ): DeckSnapshot {
    return {
      cards: cards.map((c) => ({
        cardName: c.cardName,
        zone: c.zone,
        colorIdentity: c.colorIdentity ?? [],
        typeLine: c.typeLine ?? null,
        quantity: c.quantity ?? 1,
      })),
    } as unknown as DeckSnapshot;
  }

  it("returns no issues when there is no commander", () => {
    expect(
      colorIdentityRule(
        snap([{ cardName: "Forest", zone: Zone.MAINBOARD }]),
      ),
    ).toEqual([]);
  });

  it("treats a commander with undefined colorIdentity as colorless", () => {
    // Bypass the snap helper so colorIdentity is genuinely undefined and the
    // `?? []` fallback in the commander loop is exercised.
    const deck = {
      cards: [
        { cardName: "Karn", zone: Zone.COMMANDER, quantity: 1, typeLine: null },
        {
          cardName: "Lightning Bolt",
          zone: Zone.MAINBOARD,
          colorIdentity: ["R"],
          quantity: 4,
          typeLine: null,
        },
      ],
    } as unknown as DeckSnapshot;

    const issues = colorIdentityRule(deck);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("color_identity_violation");
  });

  it("ignores SIDEBOARD cards and only checks MAINBOARD + COMMANDER", () => {
    const issues = colorIdentityRule(
      snap([
        { cardName: "Atraxa", zone: Zone.COMMANDER, colorIdentity: ["W", "U"] },
        // Off-identity but in sideboard — must NOT be flagged.
        {
          cardName: "Lightning Bolt",
          zone: Zone.SIDEBOARD,
          colorIdentity: ["R"],
        },
        // In mainboard within identity — also no issue.
        {
          cardName: "Counterspell",
          zone: Zone.MAINBOARD,
          colorIdentity: ["U"],
        },
      ]),
    );
    expect(issues).toEqual([]);
  });
});

describe("singletonRule", () => {
  function snap(
    cards: Array<{
      cardName: string;
      zone: Zone;
      typeLine?: string | null;
      quantity?: number;
    }>,
  ): DeckSnapshot {
    return {
      cards: cards.map((c) => ({
        cardName: c.cardName,
        zone: c.zone,
        colorIdentity: [],
        typeLine: c.typeLine ?? null,
        quantity: c.quantity ?? 1,
      })),
    } as unknown as DeckSnapshot;
  }

  it("flags a non-basic with more than one copy across MAINBOARD + COMMANDER", () => {
    const issues = singletonRule(
      snap([
        { cardName: "Sol Ring", zone: Zone.MAINBOARD, quantity: 1 },
        { cardName: "Sol Ring", zone: Zone.COMMANDER, quantity: 1 },
      ]),
    );
    expect(issues).toEqual([
      { kind: "singleton_violation", cardName: "Sol Ring", quantity: 2 },
    ]);
  });

  it("ignores cards outside MAINBOARD + COMMANDER", () => {
    const issues = singletonRule(
      snap([
        { cardName: "Brainstorm", zone: Zone.SIDEBOARD, quantity: 1 },
        { cardName: "Brainstorm", zone: Zone.CONSIDERING, quantity: 1 },
        { cardName: "Brainstorm", zone: Zone.MAINBOARD, quantity: 1 },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("never flags duplicate basic lands", () => {
    const issues = singletonRule(
      snap([
        { cardName: "Forest", zone: Zone.MAINBOARD, typeLine: "Basic Land — Forest", quantity: 10 },
      ]),
    );
    expect(issues).toEqual([]);
  });
});

describe("isBasicLandCard", () => {
  it("detects via type line", () => {
    expect(isBasicLandCard("Basic Land — Forest", "Forest")).toBe(true);
    expect(isBasicLandCard("Basic Snow Land — Mountain", "Snow-Covered Mountain")).toBe(true);
  });

  it("detects via name fallback when type line is missing", () => {
    expect(isBasicLandCard(null, "Wastes")).toBe(true);
    expect(isBasicLandCard(undefined, "Snow-Covered Island")).toBe(true);
  });

  it("returns false for non-basics", () => {
    expect(isBasicLandCard("Creature — Human", "Sol Ring")).toBe(false);
  });
});
