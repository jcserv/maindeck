import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { projectChanges } from "../invariants";
import { previewChanges, snapshotFromCards } from "../snapshot";
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

describe("previewChanges — singleton", () => {
  it("flags a NEW singleton violation introduced by add", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1)],
    });
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
    ];
    const { structural, legality } = previewChanges(before, changes);
    expect(structural).toHaveLength(0);
    expect(legality.length).toBeGreaterThan(0);
    expect(legality[0]!.code).toBe("singleton_violation");
  });

  it("does not flag a basic land duplicate in singleton format", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 1, Zone.MAINBOARD, "Basic Land — Forest")],
    });
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 5, zone: Zone.MAINBOARD, category: null },
    ];
    const { structural, legality } = previewChanges(before, changes);
    expect(structural).toHaveLength(0);
    expect(
      legality.filter((i) => i.code === "singleton_violation"),
    ).toHaveLength(0);
  });

  it("does not gate writes for non-singleton formats", () => {
    const before = snapshotFromCards({
      format: Format.MODERN,
      cards: [dc("dc-1", 1, "Lightning Bolt", 4)],
    });
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 4, zone: Zone.MAINBOARD, category: null },
    ];
    const { legality } = previewChanges(before, changes);
    expect(
      legality.filter((i) => i.code === "singleton_violation"),
    ).toHaveLength(0);
  });

  it("does not re-flag pre-existing violations", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc("dc-1", 1, "Sol Ring", 2),
        dc("dc-2", 2, "Mana Vault", 1),
      ],
      extraMeta: [{ cardId: 3, name: "Counterspell", typeLine: "Instant" }],
    });
    const changes: PlannedChange[] = [
      { op: "add", cardId: 3, quantity: 1, zone: Zone.MAINBOARD, category: null },
    ];
    const { legality } = previewChanges(before, changes);
    expect(
      legality.filter((i) => i.code === "singleton_violation"),
    ).toHaveLength(0);
  });
});

describe("previewChanges — structural", () => {
  it("rejects category != null for non-MAINBOARD add", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [],
      extraMeta: [{ cardId: 1, name: "Counterspell", typeLine: "Instant" }],
    });
    const changes: PlannedChange[] = [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.SIDEBOARD,
        category: "Counters",
      },
    ];
    const { structural } = previewChanges(before, changes);
    expect(structural.some((i) => i.code === "category_zone_mismatch")).toBe(true);
  });

  it("rejects category != null on move to non-MAINBOARD", () => {
    const before = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 1)],
    });
    const changes: PlannedChange[] = [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.SIDEBOARD,
        category: "Ramp",
      },
    ];
    const { structural } = previewChanges(before, changes);
    expect(structural.some((i) => i.code === "category_zone_mismatch")).toBe(true);
  });
});
