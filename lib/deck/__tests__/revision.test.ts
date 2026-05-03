import { describe, expect, it } from "vitest";
import { Zone } from "@/lib/generated/prisma/enums";
import {
  deltasToBulkChanges,
  invertDeltas,
  mergeDeltas,
  type RevisionDelta,
} from "@/lib/deck/revision";
import type { ExistingDeckCard } from "@/lib/deck/mutation/diff";

function delta(
  cardId: number,
  cardName: string,
  d: number,
  opts: { zone?: Zone; category?: string | null } = {},
): RevisionDelta {
  return {
    cardId,
    cardName,
    zone: opts.zone ?? Zone.MAINBOARD,
    category: opts.category ?? null,
    delta: d,
  };
}

describe("mergeDeltas", () => {
  it("collapses the user-story example into three net entries", () => {
    const existing: RevisionDelta[] = [
      delta(1, "Mountain", -1),
      delta(2, "Island", -1),
    ];
    const incoming: RevisionDelta[] = [delta(3, "Forest", 1)];

    const merged = mergeDeltas(existing, incoming);

    expect(merged).toHaveLength(3);
    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 1, delta: -1 }),
        expect.objectContaining({ cardId: 2, delta: -1 }),
        expect.objectContaining({ cardId: 3, delta: 1 }),
      ]),
    );
  });

  it("sums same-key entries", () => {
    const merged = mergeDeltas(
      [delta(1, "Forest", 2)],
      [delta(1, "Forest", 3)],
    );
    expect(merged).toEqual([expect.objectContaining({ cardId: 1, delta: 5 })]);
  });

  it("drops zero-sum entries", () => {
    const merged = mergeDeltas(
      [delta(1, "Forest", 1)],
      [delta(1, "Forest", -1)],
    );
    expect(merged).toEqual([]);
  });

  it("treats different zones as distinct keys", () => {
    const merged = mergeDeltas(
      [delta(1, "Forest", 1, { zone: Zone.MAINBOARD })],
      [delta(1, "Forest", -1, { zone: Zone.SIDEBOARD })],
    );
    expect(merged).toHaveLength(2);
  });

  it("treats different categories as distinct keys", () => {
    const merged = mergeDeltas(
      [delta(1, "Forest", 1, { category: "Ramp" })],
      [delta(1, "Forest", -1, { category: null })],
    );
    expect(merged).toHaveLength(2);
  });
});

describe("invertDeltas", () => {
  it("flips every sign", () => {
    const inverted = invertDeltas([
      delta(1, "Forest", 2),
      delta(2, "Island", -3),
    ]);
    expect(inverted).toEqual([
      expect.objectContaining({ cardId: 1, delta: -2 }),
      expect.objectContaining({ cardId: 2, delta: 3 }),
    ]);
  });
});

describe("deltasToBulkChanges", () => {
  const existing: ExistingDeckCard[] = [
    {
      deckCardId: "dc1",
      cardId: 1,
      zone: Zone.MAINBOARD,
      category: null,
      quantity: 2,
    },
  ];

  it("emits add when positive delta targets a missing row", () => {
    const changes = deltasToBulkChanges([delta(42, "Forest", 2)], []);
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 42,
        quantity: 2,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
  });

  it("emits update when positive delta targets an existing row", () => {
    const changes = deltasToBulkChanges([delta(1, "Forest", 1)], existing);
    expect(changes).toEqual([
      { op: "update", deckCardId: "dc1", quantity: 3 },
    ]);
  });

  it("emits remove when negative delta zeroes out the quantity", () => {
    const changes = deltasToBulkChanges([delta(1, "Forest", -2)], existing);
    expect(changes).toEqual([{ op: "remove", deckCardId: "dc1" }]);
  });

  it("emits update when negative delta leaves a positive remainder", () => {
    const existingThree: ExistingDeckCard[] = [
      { ...existing[0]!, quantity: 3 },
    ];
    const changes = deltasToBulkChanges([delta(1, "Forest", -1)], existingThree);
    expect(changes).toEqual([
      { op: "update", deckCardId: "dc1", quantity: 2 },
    ]);
  });

  it("skips zero-delta entries", () => {
    const changes = deltasToBulkChanges([delta(1, "Forest", 0)], existing);
    expect(changes).toEqual([]);
  });

  it("caps negative deltas at current quantity — removes instead of throwing", () => {
    const changes = deltasToBulkChanges([delta(1, "Forest", -99)], existing);
    expect(changes).toEqual([{ op: "remove", deckCardId: "dc1" }]);
  });

  it("silently drops negative deltas against already-missing rows", () => {
    const changes = deltasToBulkChanges([delta(999, "Gone", -1)], existing);
    expect(changes).toEqual([]);
  });

  it("matches rows by zone and category", () => {
    const changes = deltasToBulkChanges(
      [delta(1, "Forest", -1, { zone: Zone.SIDEBOARD })],
      existing,
    );
    expect(changes).toEqual([]);
  });
});
