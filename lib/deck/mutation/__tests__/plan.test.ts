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
): SnapshotCard {
  return {
    id,
    cardId,
    cardName: name,
    quantity,
    zone,
    category: null,
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
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
    ]);

    expect(plan.structural).toHaveLength(0);
    expect(plan.missingDeckCardId).toBeNull();
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ kind: "create", cardId: 1, quantity: 1 });
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: 1 }),
    ]);
  });

  it("add hitting an existing row → update op merging quantity", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const plan = planMutation(before, [
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, category: null },
    ]);

    expect(plan.ops).toEqual([
      { kind: "update", deckCardId: "dc-1", quantity: 6 },
    ]);
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: 2 }),
    ]);
  });

  it("remove → delete op + negative delta", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 4, Zone.MAINBOARD, "Artifact")],
    });
    const plan = planMutation(before, [{ op: "remove", deckCardId: "dc-1" }]);

    expect(plan.ops).toEqual([{ kind: "delete", deckCardId: "dc-1" }]);
    expect(plan.deltas).toEqual([
      expect.objectContaining({ cardId: 1, delta: -4 }),
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
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, category: null },
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

  it("no-op move (same zone+category) → no ops, no deltas", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact")],
    });
    const plan = planMutation(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, category: null },
    ]);

    expect(plan.ops).toEqual([]);
    expect(plan.deltas).toEqual([]);
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

  it("structural issues are surfaced (category on non-MAINBOARD)", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact")],
    });
    const plan = planMutation(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, category: "Ramp" },
    ]);

    expect(
      plan.structural.some((i) => i.kind === "category_zone_mismatch"),
    ).toBe(true);
  });
});
