import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Legalities } from "@/lib/card/types-meta";
import {
  buildAddDestinations,
  evaluateAddIntent,
  parseAddCardInput,
  type IntentDeckCard,
} from "../add-intent";

describe("parseAddCardInput", () => {
  it("returns quantity 1 and trimmed term when no count is present", () => {
    expect(parseAddCardInput("  sol ring ")).toEqual({
      quantity: 1,
      term: "sol ring",
    });
  });

  it("parses leading 'Nx' / 'N ' counts", () => {
    expect(parseAddCardInput("3x Lightning Bolt")).toEqual({
      quantity: 3,
      term: "Lightning Bolt",
    });
    expect(parseAddCardInput("2 Counterspell")).toEqual({
      quantity: 2,
      term: "Counterspell",
    });
  });

  it("falls back to quantity 1 when there's no separating space", () => {
    expect(parseAddCardInput("3xLightning")).toEqual({
      quantity: 1,
      term: "3xLightning",
    });
  });

  it("treats huge numbers as part of the name (caps at two digits)", () => {
    expect(parseAddCardInput("123 Lightning Bolt")).toEqual({
      quantity: 1,
      term: "123 Lightning Bolt",
    });
  });
});

describe("buildAddDestinations", () => {
  it("includes mainboard, sideboard, considering, companion and create-category by default", () => {
    const items = buildAddDestinations({
      format: Format.STANDARD,
      categories: [],
      commanderFull: false,
    });

    expect(items.map((i) => i.kind)).toEqual([
      "dest-mainboard",
      "dest-zone",
      "dest-zone",
      "dest-zone",
      "dest-create-category",
    ]);
    const zones = items
      .filter((i): i is Extract<typeof i, { kind: "dest-zone" }> =>
        i.kind === "dest-zone",
      )
      .map((i) => i.zone);
    expect(zones).toEqual([Zone.SIDEBOARD, Zone.CONSIDERING, Zone.COMPANION]);
  });

  it("inserts a mainboard entry per category, in order", () => {
    const items = buildAddDestinations({
      format: Format.STANDARD,
      categories: ["Ramp", "Removal"],
      commanderFull: false,
    });

    const mainboardEntries = items.filter(
      (i): i is { kind: "dest-mainboard"; category: string | null } =>
        i.kind === "dest-mainboard",
    );
    expect(mainboardEntries.map((i) => i.category)).toEqual([
      null,
      "Ramp",
      "Removal",
    ]);
  });

  it("adds the COMMANDER zone for COMMANDER decks", () => {
    const items = buildAddDestinations({
      format: Format.COMMANDER,
      categories: [],
      commanderFull: false,
    });

    const commanderEntry = items.find(
      (i) => i.kind === "dest-zone" && i.zone === Zone.COMMANDER,
    );
    expect(commanderEntry).toMatchObject({
      kind: "dest-zone",
      zone: Zone.COMMANDER,
      disabled: false,
    });
    expect(commanderEntry).not.toHaveProperty("hint");
  });

  it("disables the COMMANDER entry when one is already set", () => {
    const items = buildAddDestinations({
      format: Format.COMMANDER,
      categories: [],
      commanderFull: true,
    });

    const commanderEntry = items.find(
      (i) => i.kind === "dest-zone" && i.zone === Zone.COMMANDER,
    );
    expect(commanderEntry).toMatchObject({
      disabled: true,
      hint: "Commander already set",
    });
  });

  it("does not include COMMANDER zone for non-Commander formats", () => {
    const items = buildAddDestinations({
      format: Format.MODERN,
      categories: [],
      commanderFull: false,
    });
    expect(
      items.some((i) => i.kind === "dest-zone" && i.zone === Zone.COMMANDER),
    ).toBe(false);
  });
});

describe("evaluateAddIntent", () => {
  const card = {
    id: 1,
    name: "Lightning Bolt",
    legalities: { modern: "legal", commander: "legal" } as Record<
      string,
      string
    >,
    typeLine: "Instant",
    colorIdentity: ["R"],
  };

  function dc(
    cardId: number,
    zone: Zone,
    quantity: number,
  ): IntentDeckCard {
    return { card: { id: cardId }, zone, quantity };
  }

  it("treats no-format as legal with zero current copies", () => {
    const result = evaluateAddIntent({
      card,
      format: undefined,
      deckCards: [],
      quantity: 1,
    });
    expect(result).toEqual({
      legal: true,
      reasons: [],
      currentCopies: 0,
      projectedCopies: 1,
    });
  });

  it("counts mainboard + commander toward currentCopies, ignoring sideboard/considering", () => {
    const result = evaluateAddIntent({
      card,
      format: Format.MODERN,
      deckCards: [
        dc(1, Zone.MAINBOARD, 2),
        dc(1, Zone.COMMANDER, 1),
        dc(1, Zone.SIDEBOARD, 3),
        dc(1, Zone.CONSIDERING, 4),
        dc(2, Zone.MAINBOARD, 5),
      ],
      quantity: 1,
    });
    expect(result.currentCopies).toBe(3);
    expect(result.projectedCopies).toBe(4);
  });

  it("flags singleton violations in COMMANDER", () => {
    const result = evaluateAddIntent({
      card,
      format: Format.COMMANDER,
      deckCards: [dc(1, Zone.MAINBOARD, 1)],
      quantity: 1,
      commanderIdentity: ["R"],
    });
    expect(result.legal).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/singleton|already in deck|copy/i);
  });

  it("flags color-identity violations in COMMANDER", () => {
    const result = evaluateAddIntent({
      card: { ...card, colorIdentity: ["U"] },
      format: Format.COMMANDER,
      deckCards: [],
      quantity: 1,
      commanderIdentity: ["R"],
    });
    expect(result.legal).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/color identity|outside/i);
  });

  it("evaluates a non-commander format without typeLine, colorIdentity, or commanderIdentity", () => {
    const minimalCard = {
      id: 7,
      name: "Lightning Bolt",
      legalities: { modern: "legal" } as Legalities,
    };
    const result = evaluateAddIntent({
      card: minimalCard,
      format: Format.MODERN,
      deckCards: [],
      quantity: 1,
    });
    expect(result.legal).toBe(true);
    expect(result.currentCopies).toBe(0);
    expect(result.projectedCopies).toBe(1);
  });
});
