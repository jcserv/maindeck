import { describe, expect, it } from "vitest";
import { applyZoneOptimistic, type DeckCard } from "../zone-view";

// Minimal DeckCard shape sufficient for zone-view logic.
function makeCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    id: "dc-1",
    zone: "MAINBOARD",
    category: null,
    quantity: 1,
    isFoil: false,
    card: {
      id: "c-1",
      name: "Island",
      typeLine: "Basic Land — Island",
      manaCost: null,
      cmc: 0,
      colors: [],
      colorIdentity: [],
      mainType: "Land",
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: null,
      scryfallId: null,
      legalities: {},
      isGameChanger: false,
      version: "v1",
      tokens: [],
    },
    printing: null,
    ...overrides,
  } as unknown as DeckCard;
}

describe("applyZoneOptimistic", () => {
  describe('action "remove"', () => {
    it("removes the matching card", () => {
      const cards = [makeCard({ id: "dc-1" }), makeCard({ id: "dc-2" })];
      const result = applyZoneOptimistic(cards, {
        type: "remove",
        deckCardId: "dc-1",
      });
      expect(result.map((c) => c.id)).toEqual(["dc-2"]);
    });

    it("is a no-op when id is not found", () => {
      const cards = [makeCard({ id: "dc-1" })];
      const result = applyZoneOptimistic(cards, {
        type: "remove",
        deckCardId: "dc-99",
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('action "move"', () => {
    it("updates zone and category on the matching card", () => {
      const cards = [makeCard({ id: "dc-1", zone: "MAINBOARD", category: "Ramp" })];
      const result = applyZoneOptimistic(cards, {
        type: "move",
        deckCardId: "dc-1",
        zone: "SIDEBOARD",
        category: null,
      });
      expect(result[0]).toMatchObject({ zone: "SIDEBOARD", category: null });
    });

    it("leaves other cards untouched", () => {
      const cards = [makeCard({ id: "dc-1" }), makeCard({ id: "dc-2" })];
      const result = applyZoneOptimistic(cards, {
        type: "move",
        deckCardId: "dc-1",
        zone: "SIDEBOARD",
        category: null,
      });
      expect(result[1].zone).toBe("MAINBOARD");
    });
  });

  describe('action "update"', () => {
    it("updates quantity when positive", () => {
      const cards = [makeCard({ id: "dc-1", quantity: 1 })];
      const result = applyZoneOptimistic(cards, {
        type: "update",
        deckCardId: "dc-1",
        quantity: 4,
      });
      expect(result[0].quantity).toBe(4);
    });

    it("removes the card when quantity drops to zero", () => {
      const cards = [makeCard({ id: "dc-1", quantity: 1 })];
      const result = applyZoneOptimistic(cards, {
        type: "update",
        deckCardId: "dc-1",
        quantity: 0,
      });
      expect(result).toHaveLength(0);
    });

    it("removes the card when quantity is negative", () => {
      const cards = [makeCard({ id: "dc-1", quantity: 2 })];
      const result = applyZoneOptimistic(cards, {
        type: "update",
        deckCardId: "dc-1",
        quantity: -1,
      });
      expect(result).toHaveLength(0);
    });
  });
});
