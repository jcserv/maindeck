import { describe, expect, it } from "vitest";
import { Zone } from "@/lib/generated/prisma/enums";
import {
  deltaKey,
  deltasToBulkChanges,
  invertDeltas,
  mergeDeltas,
  parseRevisionDeltas,
  summarizeDeltas,
  type RevisionDelta,
} from "@/lib/deck/revision";
import type { ExistingDeckCard } from "@/lib/deck/mutation/diff";

function delta(
  cardId: number,
  cardName: string,
  d: number,
  opts: {
    zone?: Zone;
    categories?: string[];
    previousCategories?: string[];
  } = {},
): RevisionDelta {
  return {
    cardId,
    cardName,
    zone: opts.zone ?? Zone.MAINBOARD,
    categories: opts.categories ?? [],
    ...(opts.previousCategories !== undefined
      ? { previousCategories: opts.previousCategories }
      : {}),
    delta: d,
  };
}

describe("deltaKey", () => {
  it("composes cardId|zone", () => {
    expect(deltaKey({ cardId: 1, zone: Zone.MAINBOARD })).toBe("1|MAINBOARD");
    expect(deltaKey({ cardId: 1, zone: Zone.SIDEBOARD })).toBe("1|SIDEBOARD");
  });

  it("distinguishes zones but not categories", () => {
    expect(deltaKey({ cardId: 1, zone: Zone.MAINBOARD })).not.toBe(
      deltaKey({ cardId: 1, zone: Zone.SIDEBOARD }),
    );
  });
});

describe("parseRevisionDeltas", () => {
  it("parses modern-shape payloads as-is", () => {
    const parsed = parseRevisionDeltas([
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        categories: ["ramp", "rocks"],
        delta: 1,
      },
    ]);
    expect(parsed).toEqual([
      expect.objectContaining({ cardId: 1, categories: ["ramp", "rocks"] }),
    ]);
  });

  it("normalizes legacy single-category payloads to categories arrays", () => {
    const legacyPayload = [
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        category: "ramp",
        delta: 1,
      },
      {
        cardId: 2,
        cardName: "Counterspell",
        zone: Zone.MAINBOARD,
        category: null,
        delta: -1,
      },
    ];
    expect(parseRevisionDeltas(legacyPayload)).toEqual([
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        categories: ["ramp"],
        delta: 1,
      },
      {
        cardId: 2,
        cardName: "Counterspell",
        zone: Zone.MAINBOARD,
        categories: [],
        delta: -1,
      },
    ]);
  });

  it("parses modern payloads with previousCategories", () => {
    const parsed = parseRevisionDeltas([
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        categories: ["rocks"],
        previousCategories: ["ramp"],
        delta: 0,
      },
    ]);
    expect(parsed).toEqual([
      expect.objectContaining({
        categories: ["rocks"],
        previousCategories: ["ramp"],
        delta: 0,
      }),
    ]);
  });

  it("returns [] for malformed payloads", () => {
    expect(parseRevisionDeltas([{ bad: "data" }])).toEqual([]);
    expect(parseRevisionDeltas("not an array")).toEqual([]);
  });
});

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

  it("merges across categories — same card+zone nets out regardless of membership", () => {
    const merged = mergeDeltas(
      [delta(1, "Forest", 1, { categories: ["Ramp"] })],
      [delta(1, "Forest", -1, { categories: [] })],
    );
    expect(merged).toEqual([]);
  });

  it("takes the incoming side's categories when merging", () => {
    const merged = mergeDeltas(
      [delta(1, "Forest", 1, { categories: ["Ramp"] })],
      [delta(1, "Forest", 1, { categories: ["Rocks"] })],
    );
    expect(merged).toEqual([
      expect.objectContaining({ delta: 2, categories: ["Rocks"] }),
    ]);
  });

  it("keeps zero-delta recategorization entries", () => {
    const merged = mergeDeltas(
      [],
      [
        delta(1, "Sol Ring", 0, {
          categories: ["Rocks"],
          previousCategories: ["Ramp"],
        }),
      ],
    );
    expect(merged).toEqual([
      expect.objectContaining({
        delta: 0,
        categories: ["Rocks"],
        previousCategories: ["Ramp"],
      }),
    ]);
  });

  it("keeps the earliest previousCategories across merged recategorizations", () => {
    const merged = mergeDeltas(
      [
        delta(1, "Sol Ring", 0, {
          categories: ["Rocks"],
          previousCategories: ["Ramp"],
        }),
      ],
      [
        delta(1, "Sol Ring", 0, {
          categories: ["Removal"],
          previousCategories: ["Rocks"],
        }),
      ],
    );
    expect(merged).toEqual([
      expect.objectContaining({
        delta: 0,
        categories: ["Removal"],
        previousCategories: ["Ramp"],
      }),
    ]);
  });

  it("drops a recategorization that nets back to the original memberships", () => {
    const merged = mergeDeltas(
      [
        delta(1, "Sol Ring", 0, {
          categories: ["Rocks"],
          previousCategories: ["Ramp"],
        }),
      ],
      [
        delta(1, "Sol Ring", 0, {
          categories: ["Ramp"],
          previousCategories: ["Rocks"],
        }),
      ],
    );
    expect(merged).toEqual([]);
  });
});

describe("summarizeDeltas", () => {
  it("splits mixed deltas into added/removed totals with the raw entry count", () => {
    const result = summarizeDeltas([
      delta(1, "Sol Ring", 2),
      delta(2, "Counterspell", -3),
      delta(3, "Island", 4),
    ]);

    expect(result).toEqual({ added: 6, removed: 3, count: 3 });
  });

  it("reports zero removed when every delta is positive", () => {
    const result = summarizeDeltas([
      delta(1, "Sol Ring", 1),
      delta(2, "Counterspell", 2),
    ]);

    expect(result).toEqual({ added: 3, removed: 0, count: 2 });
  });

  it("returns all zeros for an empty list", () => {
    expect(summarizeDeltas([])).toEqual({ added: 0, removed: 0, count: 0 });
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

  it("swaps categories and previousCategories on recategorization entries", () => {
    const inverted = invertDeltas([
      delta(1, "Sol Ring", 0, {
        categories: ["Rocks"],
        previousCategories: ["Ramp"],
      }),
    ]);
    expect(inverted).toEqual([
      expect.objectContaining({
        delta: 0,
        categories: ["Ramp"],
        previousCategories: ["Rocks"],
      }),
    ]);
  });
});

describe("deltasToBulkChanges", () => {
  const NO_CATEGORIES: ReadonlySet<string> = new Set();

  const existing: ExistingDeckCard[] = [
    {
      deckCardId: "dc1",
      cardId: 1,
      zone: Zone.MAINBOARD,
      quantity: 2,
    },
  ];

  it("emits add when positive delta targets a missing row", () => {
    const changes = deltasToBulkChanges([delta(42, "Forest", 2)], [], NO_CATEGORIES);
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 42,
        quantity: 2,
        zone: Zone.MAINBOARD,
        categories: [],
      },
    ]);
  });

  it("restores memberships on add, filtered to categories that still exist", () => {
    const changes = deltasToBulkChanges(
      [delta(42, "Forest", 2, { categories: ["Ramp", "Gone"] })],
      [],
      new Set(["Ramp"]),
    );
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 42,
        quantity: 2,
        zone: Zone.MAINBOARD,
        categories: ["Ramp"],
      },
    ]);
  });

  it("emits update when positive delta targets an existing row", () => {
    const changes = deltasToBulkChanges(
      [delta(1, "Forest", 1)],
      existing,
      NO_CATEGORIES,
    );
    expect(changes).toEqual([
      { op: "update", deckCardId: "dc1", quantity: 3 },
    ]);
  });

  it("emits remove when negative delta zeroes out the quantity", () => {
    const changes = deltasToBulkChanges(
      [delta(1, "Forest", -2)],
      existing,
      NO_CATEGORIES,
    );
    expect(changes).toEqual([{ op: "remove", deckCardId: "dc1" }]);
  });

  it("emits update when negative delta leaves a positive remainder", () => {
    const existingThree: ExistingDeckCard[] = [
      { ...existing[0]!, quantity: 3 },
    ];
    const changes = deltasToBulkChanges(
      [delta(1, "Forest", -1)],
      existingThree,
      NO_CATEGORIES,
    );
    expect(changes).toEqual([
      { op: "update", deckCardId: "dc1", quantity: 2 },
    ]);
  });

  it("skips zero-delta entries with no membership change", () => {
    const changes = deltasToBulkChanges(
      [delta(1, "Forest", 0)],
      existing,
      NO_CATEGORIES,
    );
    expect(changes).toEqual([]);
  });

  it("emits setCategories for a zero-delta recategorization entry", () => {
    const changes = deltasToBulkChanges(
      [
        delta(1, "Sol Ring", 0, {
          categories: ["ramp", "gone"],
          previousCategories: ["rocks"],
        }),
      ],
      existing,
      new Set(["ramp", "rocks"]),
    );
    expect(changes).toEqual([
      {
        op: "setCategories",
        cardId: 1,
        zone: Zone.MAINBOARD,
        categories: ["ramp"],
      },
    ]);
  });

  it("skips a zero-delta recategorization against a missing row", () => {
    const changes = deltasToBulkChanges(
      [
        delta(999, "Gone", 0, {
          categories: ["ramp"],
          previousCategories: ["rocks"],
        }),
      ],
      existing,
      new Set(["ramp"]),
    );
    expect(changes).toEqual([]);
  });

  it("restores memberships alongside a quantity update", () => {
    const changes = deltasToBulkChanges(
      [
        delta(1, "Sol Ring", 1, {
          categories: ["ramp"],
          previousCategories: ["rocks"],
        }),
      ],
      existing,
      new Set(["ramp", "rocks"]),
    );
    expect(changes).toEqual([
      { op: "update", deckCardId: "dc1", quantity: 3 },
      {
        op: "setCategories",
        cardId: 1,
        zone: Zone.MAINBOARD,
        categories: ["ramp"],
      },
    ]);
  });

  it("caps negative deltas at current quantity — removes instead of throwing", () => {
    const changes = deltasToBulkChanges(
      [delta(1, "Forest", -99)],
      existing,
      NO_CATEGORIES,
    );
    expect(changes).toEqual([{ op: "remove", deckCardId: "dc1" }]);
  });

  it("silently drops negative deltas against already-missing rows", () => {
    const changes = deltasToBulkChanges(
      [delta(999, "Gone", -1)],
      existing,
      NO_CATEGORIES,
    );
    expect(changes).toEqual([]);
  });

  it("matches rows by zone", () => {
    const changes = deltasToBulkChanges(
      [delta(1, "Forest", -1, { zone: Zone.SIDEBOARD })],
      existing,
      NO_CATEGORIES,
    );
    expect(changes).toEqual([]);
  });

  it("nets a legacy recategorization pair to zero changes", () => {
    // Pre-multi-category recategorizations were stored as a +1/-1 pair on the
    // same card+zone with different `category` values. Parsed and merged under
    // the modern (cardId, zone) key, they cancel to nothing.
    const legacyPair = parseRevisionDeltas([
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        category: "ramp",
        delta: 1,
      },
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        category: "removal",
        delta: -1,
      },
    ]);
    expect(legacyPair).toHaveLength(2);

    const changes = deltasToBulkChanges(legacyPair, existing, new Set(["ramp"]));
    expect(changes).toEqual([]);
  });
});
