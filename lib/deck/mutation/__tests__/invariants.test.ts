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

describe("projectChanges", () => {
  it("appends a new card row on add when no existing match", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [],
      extraMeta: [{ cardId: 1, name: "Counterspell", typeLine: "Instant" }],
    });
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
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
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, category: null },
    ];
    const after = projectChanges(before, changes);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(6);
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
      { op: "move", deckCardId: "missing", zone: Zone.SIDEBOARD, category: null },
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
      { op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, category: null },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.zone).toBe(Zone.SIDEBOARD);
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
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, category: null },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(2);
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
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
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
      { op: "add", cardId: 1, quantity: 5, zone: Zone.MAINBOARD, category: null },
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
      { op: "add", cardId: 1, quantity: 4, zone: Zone.MAINBOARD, category: null },
    ]);
    expect(
      fullLegality(projected).filter((i) => i.kind === "singleton_violation"),
    ).toHaveLength(0);
  });
});

describe("checkStructural — structural", () => {
  it("rejects category != null for non-MAINBOARD add", () => {
    const changes: PlannedChange[] = [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.SIDEBOARD,
        category: "Counters",
      },
    ];
    const structural = checkStructural(changes);
    expect(structural.some((i) => i.kind === "category_zone_mismatch")).toBe(true);
  });

  it("rejects category != null on move to non-MAINBOARD", () => {
    const changes: PlannedChange[] = [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.SIDEBOARD,
        category: "Ramp",
      },
    ];
    const structural = checkStructural(changes);
    expect(structural.some((i) => i.kind === "category_zone_mismatch")).toBe(true);
  });
});
