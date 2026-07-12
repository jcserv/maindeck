import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { fullLegality } from "@/lib/deck/legality";
import { checkStructural, projectChanges } from "../invariants";
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
  printingId: number | null = null,
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
    printingId,
    isFoil: false,
  };
}

describe("projectChanges", () => {
  it("appends a new card row on add when no existing match", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [],
      extraMeta: [{ cardId: 1, name: "Counterspell", typeLine: "Instant" }],
    });
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
    ];
    const after = projectChanges(before, changes);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]).toMatchObject({ cardId: 1, quantity: 1 });
  });

  it("increments quantity on add when row exists at same key", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, categories: [] },
    ];
    const after = projectChanges(before, changes);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(6);
  });

  it("categorized add merging into an existing row replaces its memberships", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact", ["Rocks"]),
      ],
    });
    const after = projectChanges(before, [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: ["Ramp", "Artifacts"],
      },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(2);
    expect(after.cards[0]!.categories).toEqual(["Ramp", "Artifacts"]);
  });

  it("plain add (no categories) merging into an existing row keeps its memberships", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact", ["Rocks"]),
      ],
    });
    const after = projectChanges(before, [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.categories).toEqual(["Rocks"]);
  });

  it("removes a row on remove op", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const after = projectChanges(before, [
      { op: "remove", deckCardId: "dc-1" },
    ]);
    expect(after.cards).toHaveLength(0);
  });

  it("update with quantity <= 0 deletes the row", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const after = projectChanges(before, [
      { op: "update", deckCardId: "dc-1", quantity: 0 },
    ]);
    expect(after.cards).toHaveLength(0);
  });

  it("update with positive quantity sets the row's new quantity", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const after = projectChanges(before, [
      { op: "update", deckCardId: "dc-1", quantity: 7 },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(7);
  });

  it("update against a missing deckCardId is a no-op", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 4)],
    });
    const after = projectChanges(before, [
      { op: "update", deckCardId: "missing", quantity: 99 },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(4);
  });

  it("move against a missing deckCardId is a no-op", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1)],
    });
    const after = projectChanges(before, [
      { op: "move", deckCardId: "missing", zone: Zone.SIDEBOARD, categories: [] },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.zone).toBe(Zone.MAINBOARD);
  });

  it("move with no target row in the destination zone updates the row in place", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD)],
    });
    const after = projectChanges(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, categories: [] },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.zone).toBe(Zone.SIDEBOARD);
  });

  it("membership-change move keeps the row's id and replaces its categories", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact", ["Ramp"]),
      ],
    });
    const after = projectChanges(before, [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        categories: ["Rocks", "Ramp"],
      },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.id).toBe("dc-1");
    expect(after.cards[0]!.zone).toBe(Zone.MAINBOARD);
    expect(after.cards[0]!.categories).toEqual(["Rocks", "Ramp"]);
  });

  it("remove against a missing deckCardId is a no-op", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1)],
    });
    const after = projectChanges(before, [
      { op: "remove", deckCardId: "missing" },
    ]);
    expect(after.cards).toHaveLength(1);
  });

  it("move merges into existing target row", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.SIDEBOARD),
        dc("dc-2", 1, "Sol Ring", 1, Zone.MAINBOARD),
      ],
    });
    const after = projectChanges(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: [] },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(2);
  });

  it("merging move takes the move's categories on the target", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.SIDEBOARD),
        dc("dc-2", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact", ["Rocks"]),
      ],
    });
    const after = projectChanges(before, [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        categories: ["Ramp"],
      },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.id).toBe("dc-2");
    expect(after.cards[0]!.categories).toEqual(["Ramp"]);
  });

  it("move does NOT merge rows with different printings (printing-pin-safe)", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 1, Zone.SIDEBOARD, "Artifact", [], 10),
        dc("dc-2", 1, "Sol Ring", 1, Zone.MAINBOARD, "Artifact", [], 20),
      ],
    });
    const after = projectChanges(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: [] },
    ]);
    expect(after.cards).toHaveLength(2);
    const moved = after.cards.find((c) => c.id === "dc-1");
    expect(moved).toMatchObject({ zone: Zone.MAINBOARD, printingId: 10, quantity: 1 });
    const untouched = after.cards.find((c) => c.id === "dc-2");
    expect(untouched).toMatchObject({ printingId: 20, quantity: 1 });
  });
});

// `fullLegality` is the rule engine; these assert singleton rule behavior on a
// projected deck directly (the write-path before/after delta filtering it used
// to back has been removed).
describe("fullLegality — singleton", () => {
  it("flags a singleton violation for two non-basic copies", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1)],
    });
    const projected = projectChanges(before, [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
    ]);
    const violations = fullLegality(projected).filter(
      (i) => i.kind === "singleton_violation",
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("does not flag a basic land duplicate in singleton format", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 1, Zone.MAINBOARD, "Basic Land — Forest")],
    });
    const projected = projectChanges(before, [
      { op: "add", cardId: 1, quantity: 5, zone: Zone.MAINBOARD, categories: [] },
    ]);
    expect(
      fullLegality(projected).filter((i) => i.kind === "singleton_violation"),
    ).toHaveLength(0);
  });

  it("does not flag singleton violations for non-singleton formats", () => {
    const before = snapshotFromCards({
      format: Format.MODERN,
      cards: [dc("dc-1", 1, "Lightning Bolt", 4)],
    });
    const projected = projectChanges(before, [
      { op: "add", cardId: 1, quantity: 4, zone: Zone.MAINBOARD, categories: [] },
    ]);
    expect(
      fullLegality(projected).filter((i) => i.kind === "singleton_violation"),
    ).toHaveLength(0);
  });
});

describe("checkStructural — structural", () => {
  it("rejects nonempty categories on a non-MAINBOARD add", () => {
    const changes: PlannedChange[] = [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.SIDEBOARD,
        categories: ["Counters"],
      },
    ];
    const structural = checkStructural(changes, ["Counters"]);
    expect(structural.some((i) => i.kind === "category_zone_mismatch")).toBe(true);
  });

  it("rejects nonempty categories on a move to non-MAINBOARD", () => {
    const changes: PlannedChange[] = [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.SIDEBOARD,
        categories: ["Ramp"],
      },
    ];
    const structural = checkStructural(changes, ["Ramp"]);
    expect(structural.some((i) => i.kind === "category_zone_mismatch")).toBe(true);
  });

  it("emits unknown_category per name not in the deck's categories", () => {
    const changes: PlannedChange[] = [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: ["Ramp", "Ghost", "Phantom"],
      },
    ];
    const structural = checkStructural(changes, ["Ramp"]);
    expect(structural).toEqual([
      { kind: "unknown_category", category: "Ghost" },
      { kind: "unknown_category", category: "Phantom" },
    ]);
  });

  it("accepts known categories on MAINBOARD without issues", () => {
    const changes: PlannedChange[] = [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.MAINBOARD,
        categories: ["Ramp"],
      },
    ];
    expect(checkStructural(changes, ["Ramp"])).toEqual([]);
  });
});
