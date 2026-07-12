import { describe, expect, it } from "vitest";
import { Zone } from "@/lib/generated/prisma/enums";
import { groupDeltasByZone } from "@/lib/deck/group-deltas";
import type { RevisionDelta } from "@/lib/deck/revision";

function delta(
  cardId: number,
  cardName: string,
  d: number,
  opts: { zone?: Zone; categories?: string[] } = {},
): RevisionDelta {
  return {
    cardId,
    cardName,
    zone: opts.zone ?? Zone.MAINBOARD,
    categories: opts.categories ?? [],
    delta: d,
  };
}

describe("groupDeltasByZone", () => {
  it("returns an empty array for no deltas", () => {
    expect(groupDeltasByZone([])).toEqual([]);
  });

  it("orders zones commander, companion, mainboard, sideboard, considering", () => {
    const deltas = [
      delta(1, "Sol Ring", 1, { zone: Zone.CONSIDERING }),
      delta(2, "Lurrus", 1, { zone: Zone.COMPANION }),
      delta(3, "Arahbo", 1, { zone: Zone.COMMANDER }),
      delta(4, "Swords to Plowshares", 1, { zone: Zone.SIDEBOARD }),
      delta(5, "Wrath of God", 1, { zone: Zone.MAINBOARD }),
    ];

    expect(groupDeltasByZone(deltas).map((g) => g.zone)).toEqual([
      Zone.COMMANDER,
      Zone.COMPANION,
      Zone.MAINBOARD,
      Zone.SIDEBOARD,
      Zone.CONSIDERING,
    ]);
  });

  it("omits zones with no deltas", () => {
    const deltas = [delta(1, "Sol Ring", 1, { zone: Zone.MAINBOARD })];

    const groups = groupDeltasByZone(deltas);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.zone).toBe(Zone.MAINBOARD);
  });

  it("sorts additions before removals within a zone", () => {
    const deltas = [
      delta(1, "Zzz Removal", -1),
      delta(2, "Aaa Addition", 1),
    ];

    const [group] = groupDeltasByZone(deltas);

    expect(group!.deltas.map((d) => d.cardName)).toEqual([
      "Aaa Addition",
      "Zzz Removal",
    ]);
  });

  it("sorts same-sign deltas alphabetically by card name", () => {
    const deltas = [
      delta(1, "Zendikar Resurgent", 1),
      delta(2, "Arcane Signet", 1),
    ];

    const [group] = groupDeltasByZone(deltas);

    expect(group!.deltas.map((d) => d.cardName)).toEqual([
      "Arcane Signet",
      "Zendikar Resurgent",
    ]);
  });
});
