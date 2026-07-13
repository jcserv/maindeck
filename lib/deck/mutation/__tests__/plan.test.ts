import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { planMutation } from "../index";
import { snapshotFromCards } from "../snapshot";
import type { PlannedChange, SnapshotCard } from "../types";

function dc(
  id: string,
  cardId: number,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
  typeLine: string | null = "Creature — Human",
  categories: string[] = [],
): SnapshotCard {
  return {
    id,
    cardId,
    cardName: name,
    quantity,
    zone,
    categories,
    typeLine,
    colorIdentity: [],
    legalities: { commander: "legal" },
    printingId: null,
    isFoil: false,
  };
}

describe("planMutation — op kinds", () => {
  it("add (no existing row) → create op + positive delta", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [],
      extraMeta: [{ cardId: 1, name: "Counterspell", typeLine: "Instant" }],
    });
    const plan = planMutation(before, [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
    ]);

    expect(plan.structural).toHaveLength(0);
    expect(plan.missingDeckCardId).toBeNull();
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ kind: "create", cardId: 1, quantity: 1 });
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: 1, categories: [] }),
    ]);
  });

  it("add hitting an existing row → update op merging quantity", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const plan = planMutation(before, [
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, categories: [] },
    ]);

    expect(plan.ops).toEqual([
      { kind: "update", deckCardId: "dc-1", quantity: 6 },
    ]);
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: 2 }),
    ]);
  });

  it("remove → delete op + negative delta carrying the before-side categories", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 4, Zone.MAINBOARD, "Artifact", ["Ramp"]),
      ],
      categoryNames: ["Ramp"],
    });
    const plan = planMutation(before, [{ op: "remove", deckCardId: "dc-1" }]);

    expect(plan.ops).toEqual([{ kind: "delete", deckCardId: "dc-1" }]);
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: -4, categories: ["Ramp"] }),
    ]);
  });

  it("update positive quantity → update op + signed delta", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const plan = planMutation(before, [
      { op: "update", deckCardId: "dc-1", quantity: 7 },
    ]);

    expect(plan.ops).toEqual([
      { kind: "update", deckCardId: "dc-1", quantity: 7 },
    ]);
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: 3 }),
    ]);
  });

  it("update to quantity 0 → delete op", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const plan = planMutation(before, [
      { op: "update", deckCardId: "dc-1", quantity: 0 },
    ]);

    expect(plan.ops).toEqual([{ kind: "delete", deckCardId: "dc-1" }]);
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: -4 }),
    ]);
  });

  it("move to a new zone → update op + paired deltas across zones", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact")],
    });
    const plan = planMutation(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, categories: [] },
    ]);

    expect(plan.ops).toEqual([
      { kind: "update", deckCardId: "dc-1", zone: Zone.SIDEBOARD },
    ]);
    expect(plan.deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ zone: Zone.MAINBOARD, delta: -1 }),
        expect.objectContaining({ zone: Zone.SIDEBOARD, delta: 1 }),
      ]),
    );
  });

  it("no-op move (same zone + same categories) → no ops, no deltas", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact")],
    });
    const plan = planMutation(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: [] },
    ]);

    expect(plan.ops).toEqual([]);
    expect(plan.deltas).toEqual([]);
  });

  it("category-only change → categories update op + zero-delta recategorization entry", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact", ["Ramp"]),
      ],
      categoryNames: ["Ramp", "Rocks"],
    });
    const plan = planMutation(before, [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        categories: ["Rocks"],
      },
    ]);

    expect(plan.structural).toEqual([]);
    expect(plan.ops).toEqual([
      { kind: "update", deckCardId: "dc-1", categories: ["Rocks"] },
    ]);
    expect(plan.deltas).toEqual([
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        categories: ["Rocks"],
        previousCategories: ["Ramp"],
        delta: 0,
      },
    ]);
  });

  it("quantity change with unchanged categories carries no previousCategories", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact", ["Ramp"]),
      ],
      categoryNames: ["Ramp"],
    });
    const plan = planMutation(before, [
      { op: "update", deckCardId: "dc-1", quantity: 2 },
    ]);

    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: 1, categories: ["Ramp"] }),
    ]);
    expect(plan.deltas[0]).not.toHaveProperty("previousCategories");
  });

  it("two before-side rows sharing (cardId, zone) accumulate delta without the second row overwriting previousCategories", () => {
    // dc-1 and dc-2 are distinct DeckCard rows (e.g. different printings)
    // that collapse onto the same computeDeltas accumulator key
    // (`${cardId}|${zone}`). The second before-side bump must add to the
    // existing entry's delta without touching its categories/previousCategories
    // — that update only happens on after-side bumps.
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 2, Zone.MAINBOARD, "Artifact", ["Ramp"]),
        dc("dc-2", 1, "Sol Ring", 3, Zone.MAINBOARD, "Artifact", ["Rocks"]),
      ],
      extraMeta: [{ cardId: 2, name: "Forest", typeLine: "Basic Land — Forest" }],
      categoryNames: ["Ramp", "Rocks"],
    });
    const plan = planMutation(before, [
      { op: "add", cardId: 2, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
    ]);

    expect(plan.deltas).toContainEqual({
      cardId: 1,
      cardName: "Sol Ring",
      zone: Zone.MAINBOARD,
      categories: ["Rocks"],
      previousCategories: ["Ramp"],
      delta: 0,
    });
  });

  it("categorized add carries no previousCategories (no before-state)", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [],
      extraMeta: [{ cardId: 1, name: "Sol Ring", typeLine: "Artifact" }],
      categoryNames: ["Ramp"],
    });
    const plan = planMutation(before, [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: ["Ramp"],
      },
    ]);

    expect(plan.deltas).toEqual([
      expect.objectContaining({ delta: 1, categories: ["Ramp"] }),
    ]);
    expect(plan.deltas[0]).not.toHaveProperty("previousCategories");
  });
});

describe("planMutation — opts matrix", () => {
  it("skipRevision: true zeroes deltas but keeps ops", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const changes: PlannedChange[] = [
      { op: "update", deckCardId: "dc-1", quantity: 7 },
    ];

    const withRevision = planMutation(before, changes);
    expect(withRevision.deltas.length).toBeGreaterThan(0);

    const skipped = planMutation(before, changes, { skipRevision: true });
    expect(skipped.deltas).toEqual([]);
    expect(skipped.ops).toEqual(withRevision.ops);
  });
});

describe("planMutation — guards", () => {
  it("missing deckCardId is surfaced, leaving ops empty (projection no-op)", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const plan = planMutation(before, [
      { op: "update", deckCardId: "missing", quantity: 7 },
    ]);

    expect(plan.missingDeckCardId).toBe("missing");
    expect(plan.ops).toEqual([]);
    expect(plan.deltas).toEqual([]);
  });

  it("structural issues are surfaced (categories on non-MAINBOARD)", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact")],
      categoryNames: ["Ramp"],
    });
    const plan = planMutation(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, categories: ["Ramp"] },
    ]);

    expect(
      plan.structural.some((i) => i.kind === "category_zone_mismatch"),
    ).toBe(true);
  });

  it("structural issues are surfaced (unknown category name)", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact")],
      categoryNames: ["Ramp"],
    });
    const plan = planMutation(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: ["Ghost"] },
    ]);

    expect(plan.structural).toEqual([
      { kind: "unknown_category", category: "Ghost" },
    ]);
  });
});
