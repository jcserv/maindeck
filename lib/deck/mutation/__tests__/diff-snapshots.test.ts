import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { projectChanges } from "../invariants";
import { diffSnapshots } from "../diff-snapshots";
import { snapshotFromCards } from "../snapshot";
import type { PlannedChange, SnapshotCard } from "../types";

function dc(
  id: string,
  cardId: number,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
  categories: string[] = [],
): SnapshotCard {
  return {
    id,
    cardId,
    cardName: name,
    quantity,
    zone,
    categories,
    typeLine: "Creature — Human",
    colorIdentity: [],
    legalities: { commander: "legal" },
    printingId: null,
    isFoil: false,
  };
}

function applied(
  cards: SnapshotCard[],
  changes: PlannedChange[],
  extraMeta?: Parameters<typeof snapshotFromCards>[0]["extraMeta"],
) {
  const before = snapshotFromCards({
    format: Format.COMMANDER,
    cards,
    ...(extraMeta ? { extraMeta } : {}),
  });
  const after = projectChanges(before, changes);
  return diffSnapshots(before, after);
}

describe("diffSnapshots", () => {
  it("emits create for an add with no existing match", () => {
    const ops = applied(
      [],
      [{ op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] }],
      [{ cardId: 1, name: "Counterspell", typeLine: "Instant" }],
    );
    expect(ops).toEqual([
      {
        kind: "create",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: [],
        printingId: null,
        isFoil: false,
      },
    ]);
  });

  it("carries ordered categories on a categorized create", () => {
    const ops = applied(
      [],
      [
        {
          op: "add",
          cardId: 1,
          quantity: 1,
          zone: Zone.MAINBOARD,
          categories: ["Ramp", "Rocks"],
        },
      ],
      [{ cardId: 1, name: "Sol Ring", typeLine: "Artifact" }],
    );
    expect(ops).toEqual([
      {
        kind: "create",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: ["Ramp", "Rocks"],
        printingId: null,
        isFoil: false,
      },
    ]);
  });

  it("emits quantity update when an add merges into an existing row", () => {
    const ops = applied(
      [dc("dc-1", 1, "Forest", 4)],
      [{ op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, categories: [] }],
    );
    expect(ops).toEqual([
      { kind: "update", deckCardId: "dc-1", quantity: 6 },
    ]);
  });

  it("emits only changed zone field on an in-place move", () => {
    const ops = applied(
      [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD)],
      [{ op: "move", deckCardId: "dc-1", zone: Zone.SIDEBOARD, categories: [] }],
    );
    expect(ops).toEqual([
      { kind: "update", deckCardId: "dc-1", zone: Zone.SIDEBOARD },
    ]);
  });

  it("expresses merging move as quantity update plus source delete", () => {
    const ops = applied(
      [
        dc("dc-src", 1, "Sol Ring", 2, Zone.MAINBOARD),
        dc("dc-tgt", 1, "Sol Ring", 1, Zone.SIDEBOARD),
      ],
      [{ op: "move", deckCardId: "dc-src", zone: Zone.SIDEBOARD, categories: [] }],
    );
    expect(ops).toContainEqual({
      kind: "update",
      deckCardId: "dc-tgt",
      quantity: 3,
    });
    expect(ops).toContainEqual({ kind: "delete", deckCardId: "dc-src" });
    expect(ops).toHaveLength(2);
  });

  it("returns no ops when nothing changed", () => {
    const ops = applied(
      [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD)],
      [{ op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, categories: [] }],
    );
    expect(ops).toEqual([]);
  });

  it("emits a whole-array categories update when memberships change", () => {
    const ops = applied(
      [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, ["Ramp"])],
      [
        {
          op: "move",
          deckCardId: "dc-1",
          zone: Zone.MAINBOARD,
          categories: ["Rocks"],
        },
      ],
    );
    expect(ops).toEqual([
      { kind: "update", deckCardId: "dc-1", categories: ["Rocks"] },
    ]);
  });

  it("emits a categories update when only the order changes", () => {
    const ops = applied(
      [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, ["Ramp", "Rocks"])],
      [
        {
          op: "move",
          deckCardId: "dc-1",
          zone: Zone.MAINBOARD,
          categories: ["Rocks", "Ramp"],
        },
      ],
    );
    expect(ops).toEqual([
      { kind: "update", deckCardId: "dc-1", categories: ["Rocks", "Ramp"] },
    ]);
  });

  it("emits no op when categories are unchanged element-wise", () => {
    const ops = applied(
      [dc("dc-1", 1, "Sol Ring", 1, Zone.MAINBOARD, ["Ramp", "Rocks"])],
      [
        {
          op: "move",
          deckCardId: "dc-1",
          zone: Zone.MAINBOARD,
          categories: ["Ramp", "Rocks"],
        },
      ],
    );
    expect(ops).toEqual([]);
  });
});
