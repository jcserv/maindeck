import { describe, expect, it } from "vitest";
import {
  allocateBasics,
  basicsSlotTarget,
  type PipSkew,
} from "../allocate";

function pips(p: Partial<PipSkew>): PipSkew {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...p };
}

function sum(a: PipSkew): number {
  return a.W + a.U + a.B + a.R + a.G + a.C;
}

describe("allocateBasics", () => {
  it("always sums to the slot count", () => {
    const alloc = allocateBasics(pips({ U: 7, B: 3 }), 17);
    expect(sum(alloc)).toBe(17);
  });

  it("favors the heavier color in a blue-heavy U/B deck", () => {
    const alloc = allocateBasics(pips({ U: 30, B: 10 }), 16, {
      colorIdentity: ["U", "B"],
    });
    expect(alloc.U).toBeGreaterThan(alloc.B);
    expect(alloc.U + alloc.B).toBe(16);
    expect(alloc.W).toBe(0);
    expect(alloc.R).toBe(0);
    expect(alloc.G).toBe(0);
    expect(alloc.C).toBe(0);
  });

  it("routes everything to C for a genuinely colorless deck", () => {
    const alloc = allocateBasics(pips({}), 12);
    expect(alloc).toEqual(pips({ C: 12 }));
  });

  it("splits evenly across identity colors when the deck has no pips yet", () => {
    const alloc = allocateBasics(pips({}), 10, { colorIdentity: ["U", "B"] });
    expect(alloc.U).toBe(5);
    expect(alloc.B).toBe(5);
    expect(alloc.C).toBe(0);
  });

  it("never gives an off-identity color a basic", () => {
    const alloc = allocateBasics(pips({ W: 5, R: 5 }), 8, {
      colorIdentity: ["U", "B"],
    });
    expect(alloc.W).toBe(0);
    expect(alloc.R).toBe(0);
    expect(alloc.U + alloc.B).toBe(8);
  });

  it("returns all zeros for zero slots", () => {
    expect(allocateBasics(pips({ U: 5 }), 0)).toEqual(pips({}));
    expect(allocateBasics(pips({ U: 5 }), -3)).toEqual(pips({}));
  });

  it("breaks remainder ties in WUBRG order", () => {
    // Even three-way split of 10: quotas 3.33 each, two leftovers go to the
    // two earliest colors in WUBRG order (W then U), not B.
    const alloc = allocateBasics(pips({ W: 1, U: 1, B: 1 }), 10);
    expect(alloc.W).toBe(4);
    expect(alloc.U).toBe(3);
    expect(alloc.B).toBe(3);
  });
});

describe("basicsSlotTarget", () => {
  it("subtracts current lands and manual picks from the target", () => {
    expect(basicsSlotTarget(36, 10, 4)).toBe(22);
  });

  it("never goes negative", () => {
    expect(basicsSlotTarget(36, 40, 0)).toBe(0);
    expect(basicsSlotTarget(24, 10, 20)).toBe(0);
  });
});
