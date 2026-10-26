import { describe, expect, it } from "vitest";
import {
  planBulkCardAction,
  type BulkCardState,
} from "../bulk-actions";

const KNOWN = new Set(["ramp", "draw", "removal"]);

function card(
  id: string,
  zone: BulkCardState["zone"],
  categories: string[] = [],
): BulkCardState {
  return { id, zone, categories };
}

describe("planBulkCardAction", () => {
  describe("remove", () => {
    it("deletes DeckCards selected via their primary row", () => {
      const cards = [card("a", "MAINBOARD", ["ramp"]), card("b", "SIDEBOARD")];
      expect(
        planBulkCardAction(
          cards,
          [{ deckCardId: "a" }, { deckCardId: "b" }],
          { kind: "remove" },
          KNOWN,
        ),
      ).toEqual([
        { op: "remove", deckCardId: "a" },
        { op: "remove", deckCardId: "b" },
      ]);
    });

    it("strips only the ghost memberships when a DeckCard is selected solely via ghost rows", () => {
      const cards = [card("a", "MAINBOARD", ["ramp", "draw", "removal"])];
      expect(
        planBulkCardAction(
          cards,
          [
            { deckCardId: "a", viaCategory: "draw" },
            { deckCardId: "a", viaCategory: "removal" },
          ],
          { kind: "remove" },
          KNOWN,
        ),
      ).toEqual([
        {
          op: "move",
          deckCardId: "a",
          zone: "MAINBOARD",
          categories: ["ramp"],
        },
      ]);
    });

    it("deletes the DeckCard when both its primary and a ghost row are selected", () => {
      const cards = [card("a", "MAINBOARD", ["ramp", "draw"])];
      expect(
        planBulkCardAction(
          cards,
          [{ deckCardId: "a", viaCategory: "draw" }, { deckCardId: "a" }],
          { kind: "remove" },
          KNOWN,
        ),
      ).toEqual([{ op: "remove", deckCardId: "a" }]);
    });
  });

  describe("moveZone", () => {
    it("moves each DeckCard once, clears memberships, and skips cards already in the zone", () => {
      const cards = [
        card("a", "MAINBOARD", ["ramp", "draw"]),
        card("b", "SIDEBOARD"),
      ];
      expect(
        planBulkCardAction(
          cards,
          [
            { deckCardId: "a" },
            { deckCardId: "a", viaCategory: "draw" },
            { deckCardId: "b" },
          ],
          { kind: "moveZone", zone: "SIDEBOARD" },
          KNOWN,
        ),
      ).toEqual([
        { op: "move", deckCardId: "a", zone: "SIDEBOARD", categories: [] },
      ]);
    });
  });

  describe("setPrimaryCategory", () => {
    it("makes the category primary, keeps other mainboard memberships, and pulls non-mainboard cards in", () => {
      const cards = [
        card("a", "MAINBOARD", ["draw", "removal"]),
        card("b", "CONSIDERING"),
        card("c", "MAINBOARD", ["ramp"]),
      ];
      expect(
        planBulkCardAction(
          cards,
          [{ deckCardId: "a" }, { deckCardId: "b" }, { deckCardId: "c" }],
          { kind: "setPrimaryCategory", category: "ramp" },
          KNOWN,
        ),
      ).toEqual([
        {
          op: "move",
          deckCardId: "a",
          zone: "MAINBOARD",
          categories: ["ramp", "draw", "removal"],
        },
        { op: "move", deckCardId: "b", zone: "MAINBOARD", categories: ["ramp"] },
      ]);
    });

    it("clears every membership for the Uncategorized target", () => {
      const cards = [card("a", "MAINBOARD", ["ramp", "draw"])];
      expect(
        planBulkCardAction(
          cards,
          [{ deckCardId: "a" }],
          { kind: "setPrimaryCategory", category: null },
          KNOWN,
        ),
      ).toEqual([
        { op: "move", deckCardId: "a", zone: "MAINBOARD", categories: [] },
      ]);
    });

    it("is a no-op for a category no longer in the registry", () => {
      const cards = [card("a", "MAINBOARD", ["ramp"])];
      expect(
        planBulkCardAction(
          cards,
          [{ deckCardId: "a" }],
          { kind: "setPrimaryCategory", category: "deleted" },
          KNOWN,
        ),
      ).toEqual([]);
    });
  });

  describe("addCategory / removeCategory", () => {
    it("appends a secondary membership, skipping existing members", () => {
      const cards = [
        card("a", "MAINBOARD", ["ramp"]),
        card("b", "MAINBOARD", ["draw"]),
        card("c", "SIDEBOARD"),
      ];
      expect(
        planBulkCardAction(
          cards,
          [{ deckCardId: "a" }, { deckCardId: "b" }, { deckCardId: "c" }],
          { kind: "addCategory", category: "draw" },
          KNOWN,
        ),
      ).toEqual([
        {
          op: "move",
          deckCardId: "a",
          zone: "MAINBOARD",
          categories: ["ramp", "draw"],
        },
        { op: "move", deckCardId: "c", zone: "MAINBOARD", categories: ["draw"] },
      ]);
    });

    it("strips the membership from mainboard members only", () => {
      const cards = [
        card("a", "MAINBOARD", ["ramp", "draw"]),
        card("b", "MAINBOARD", ["removal"]),
        card("c", "SIDEBOARD"),
      ];
      expect(
        planBulkCardAction(
          cards,
          [{ deckCardId: "a" }, { deckCardId: "b" }, { deckCardId: "c" }],
          { kind: "removeCategory", category: "ramp" },
          KNOWN,
        ),
      ).toEqual([
        { op: "move", deckCardId: "a", zone: "MAINBOARD", categories: ["draw"] },
      ]);
    });
  });

  it("ignores targets that are no longer on the deck", () => {
    expect(
      planBulkCardAction(
        [card("a", "MAINBOARD")],
        [{ deckCardId: "gone" }],
        { kind: "remove" },
        KNOWN,
      ),
    ).toEqual([]);
  });
});
