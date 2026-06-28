import { describe, expect, it } from "vitest";
import {
  basisUsd,
  highestUsd,
  isPrintingHeuristic,
  lowestUsd,
  selectPrintingId,
  type HeuristicPrinting,
} from "@/lib/card/printing-heuristics";
import { isUniversesBeyondSet } from "@/lib/card/universes-beyond";

function printing(
  overrides: Partial<HeuristicPrinting> & { id: number },
): HeuristicPrinting {
  return {
    setCode: "abc",
    priceUsd: null,
    priceUsdFoil: null,
    priceUsdEtched: null,
    ...overrides,
  };
}

describe("price extremes", () => {
  it("lowestUsd / highestUsd ignore null finishes", () => {
    const p = printing({ id: 1, priceUsd: 5, priceUsdFoil: 20, priceUsdEtched: null });
    expect(lowestUsd(p)).toBe(5);
    expect(highestUsd(p)).toBe(20);
  });

  it("return null when fully unpriced", () => {
    const p = printing({ id: 1 });
    expect(lowestUsd(p)).toBeNull();
    expect(highestUsd(p)).toBeNull();
  });
});

describe("isUniversesBeyondSet", () => {
  it("flags UB set codes case-insensitively", () => {
    expect(isUniversesBeyondSet("ltr")).toBe(true);
    expect(isUniversesBeyondSet("40K")).toBe(true);
    expect(isUniversesBeyondSet("PIP")).toBe(true);
  });

  it("does not flag normal or mixed sets", () => {
    expect(isUniversesBeyondSet("dom")).toBe(false);
    expect(isUniversesBeyondSet("sld")).toBe(false); // Secret Lair is mixed
  });
});

describe("isPrintingHeuristic", () => {
  it("guards the heuristic union", () => {
    expect(isPrintingHeuristic("cheapest")).toBe(true);
    expect(isPrintingHeuristic("nope")).toBe(false);
  });
});

describe("basisUsd", () => {
  it("counts nonfoil price for nonfoil lines, ignoring foil/etched", () => {
    const p = printing({ id: 1, priceUsd: 5, priceUsdFoil: 2, priceUsdEtched: 1 });
    expect(basisUsd(p, false)).toBe(5);
  });

  it("counts foil price for foil lines, falling back to nonfoil", () => {
    expect(basisUsd(printing({ id: 1, priceUsd: 5, priceUsdFoil: 9 }), true)).toBe(9);
    expect(basisUsd(printing({ id: 1, priceUsd: 5 }), true)).toBe(5);
  });

  it("never counts etched", () => {
    const p = printing({ id: 1, priceUsd: null, priceUsdEtched: 2 });
    expect(basisUsd(p, false)).toBeNull();
    expect(basisUsd(p, true)).toBeNull();
  });
});

describe("selectPrintingId — cheapest", () => {
  const printings = [
    printing({ id: 1, priceUsd: 10 }),
    printing({ id: 2, priceUsd: 3 }),
    printing({ id: 3, priceUsd: 7 }),
  ];

  it("picks the lowest-priced printing", () => {
    expect(selectPrintingId(printings, "cheapest", 1, false)).toBe(2);
  });

  it("ranks nonfoil lines by nonfoil price, never foil/etched", () => {
    const ps = [
      printing({ id: 1, priceUsd: 10 }),
      // Cheap only as a foil — must NOT be chosen for a nonfoil line, since the
      // deck would still count its $50 nonfoil price.
      printing({ id: 2, priceUsd: 50, priceUsdFoil: 2 }),
    ];
    expect(selectPrintingId(ps, "cheapest", 1, false)).toBeNull();
  });

  it("ranks foil lines by foil price", () => {
    const ps = [
      printing({ id: 1, priceUsd: 10, priceUsdFoil: 12 }),
      printing({ id: 2, priceUsd: 50, priceUsdFoil: 2 }),
    ];
    expect(selectPrintingId(ps, "cheapest", 1, true)).toBe(2);
  });

  it("returns null when the cheapest is already pinned", () => {
    expect(selectPrintingId(printings, "cheapest", 2, false)).toBeNull();
  });

  it("returns null when no printing is priced (no data loss)", () => {
    const ps = [printing({ id: 1 }), printing({ id: 2 })];
    expect(selectPrintingId(ps, "cheapest", 1, false)).toBeNull();
  });

  it("breaks ties on lowest id deterministically", () => {
    const ps = [
      printing({ id: 5, priceUsd: 4 }),
      printing({ id: 2, priceUsd: 4 }),
    ];
    expect(selectPrintingId(ps, "cheapest", 5, false)).toBe(2);
  });
});

describe("selectPrintingId — most-expensive", () => {
  const printings = [
    printing({ id: 1, priceUsd: 10 }),
    printing({ id: 2, priceUsd: 3 }),
    printing({ id: 3, priceUsd: 25 }),
  ];

  it("picks the highest-priced printing", () => {
    expect(selectPrintingId(printings, "most-expensive", 1, false)).toBe(3);
  });

  it("ranks nonfoil lines by nonfoil price, never foil/etched", () => {
    const ps = [
      printing({ id: 1, priceUsd: 10 }),
      // Expensive only as a foil — irrelevant to a nonfoil line.
      printing({ id: 2, priceUsd: 1, priceUsdFoil: 99 }),
    ];
    expect(selectPrintingId(ps, "most-expensive", 1, false)).toBeNull();
  });

  it("ranks foil lines by foil price", () => {
    const ps = [
      printing({ id: 1, priceUsd: 10, priceUsdFoil: 11 }),
      printing({ id: 2, priceUsd: 1, priceUsdFoil: 99 }),
    ];
    expect(selectPrintingId(ps, "most-expensive", 1, true)).toBe(2);
  });

  it("returns null when the most expensive is already pinned", () => {
    expect(selectPrintingId(printings, "most-expensive", 3, false)).toBeNull();
  });
});

describe("selectPrintingId — no-universes-beyond", () => {
  it("swaps a UB printing for the cheapest non-UB one", () => {
    const ps = [
      printing({ id: 1, setCode: "ltr", priceUsd: 5 }),
      printing({ id: 2, setCode: "dom", priceUsd: 8 }),
      printing({ id: 3, setCode: "war", priceUsd: 4 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1, false)).toBe(3);
  });

  it("leaves a non-UB current printing unchanged", () => {
    const ps = [
      printing({ id: 1, setCode: "dom", priceUsd: 8 }),
      printing({ id: 2, setCode: "ltr", priceUsd: 5 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1, false)).toBeNull();
  });

  it("leaves unchanged when no non-UB alternative exists (no data loss)", () => {
    const ps = [
      printing({ id: 1, setCode: "ltr", priceUsd: 5 }),
      printing({ id: 2, setCode: "40k", priceUsd: 9 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1, false)).toBeNull();
  });

  it("falls back to a non-UB printing even when none are priced", () => {
    const ps = [
      printing({ id: 1, setCode: "ltr", priceUsd: 5 }),
      printing({ id: 4, setCode: "dom" }),
      printing({ id: 2, setCode: "war" }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1, false)).toBe(2);
  });

  it("swaps an unpinned card whose canonical (lowest-id) printing is UB", () => {
    const ps = [
      printing({ id: 1, setCode: "ltr", priceUsd: 5 }),
      printing({ id: 2, setCode: "dom", priceUsd: 8 }),
      printing({ id: 3, setCode: "war", priceUsd: 4 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", null, false)).toBe(3);
  });

  it("leaves an unpinned card whose canonical printing is non-UB unchanged", () => {
    const ps = [
      printing({ id: 1, setCode: "dom", priceUsd: 8 }),
      printing({ id: 2, setCode: "ltr", priceUsd: 5 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", null, false)).toBeNull();
  });

  it("returns null when the current pin isn't in the list", () => {
    const ps = [printing({ id: 1, setCode: "dom", priceUsd: 8 })];
    expect(selectPrintingId(ps, "no-universes-beyond", 999, false)).toBeNull();
  });
});
