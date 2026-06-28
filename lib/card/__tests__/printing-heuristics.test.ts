import { describe, expect, it } from "vitest";
import {
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

describe("selectPrintingId — cheapest", () => {
  const printings = [
    printing({ id: 1, priceUsd: 10 }),
    printing({ id: 2, priceUsd: 3 }),
    printing({ id: 3, priceUsd: 7 }),
  ];

  it("picks the lowest-priced printing", () => {
    expect(selectPrintingId(printings, "cheapest", 1)).toBe(2);
  });

  it("uses the cheapest finish, not just nonfoil", () => {
    const ps = [
      printing({ id: 1, priceUsd: 10 }),
      printing({ id: 2, priceUsd: 50, priceUsdFoil: 2 }),
    ];
    expect(selectPrintingId(ps, "cheapest", 1)).toBe(2);
  });

  it("returns null when the cheapest is already pinned", () => {
    expect(selectPrintingId(printings, "cheapest", 2)).toBeNull();
  });

  it("returns null when no printing is priced (no data loss)", () => {
    const ps = [printing({ id: 1 }), printing({ id: 2 })];
    expect(selectPrintingId(ps, "cheapest", 1)).toBeNull();
  });

  it("breaks ties on lowest id deterministically", () => {
    const ps = [
      printing({ id: 5, priceUsd: 4 }),
      printing({ id: 2, priceUsd: 4 }),
    ];
    expect(selectPrintingId(ps, "cheapest", 5)).toBe(2);
  });
});

describe("selectPrintingId — most-expensive", () => {
  const printings = [
    printing({ id: 1, priceUsd: 10 }),
    printing({ id: 2, priceUsd: 3 }),
    printing({ id: 3, priceUsd: 25 }),
  ];

  it("picks the highest-priced printing", () => {
    expect(selectPrintingId(printings, "most-expensive", 1)).toBe(3);
  });

  it("uses the most expensive finish", () => {
    const ps = [
      printing({ id: 1, priceUsd: 10 }),
      printing({ id: 2, priceUsd: 1, priceUsdFoil: 99 }),
    ];
    expect(selectPrintingId(ps, "most-expensive", 1)).toBe(2);
  });

  it("returns null when the most expensive is already pinned", () => {
    expect(selectPrintingId(printings, "most-expensive", 3)).toBeNull();
  });
});

describe("selectPrintingId — no-universes-beyond", () => {
  it("swaps a UB printing for the cheapest non-UB one", () => {
    const ps = [
      printing({ id: 1, setCode: "ltr", priceUsd: 5 }),
      printing({ id: 2, setCode: "dom", priceUsd: 8 }),
      printing({ id: 3, setCode: "war", priceUsd: 4 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1)).toBe(3);
  });

  it("leaves a non-UB current printing unchanged", () => {
    const ps = [
      printing({ id: 1, setCode: "dom", priceUsd: 8 }),
      printing({ id: 2, setCode: "ltr", priceUsd: 5 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1)).toBeNull();
  });

  it("leaves unchanged when no non-UB alternative exists (no data loss)", () => {
    const ps = [
      printing({ id: 1, setCode: "ltr", priceUsd: 5 }),
      printing({ id: 2, setCode: "40k", priceUsd: 9 }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1)).toBeNull();
  });

  it("falls back to a non-UB printing even when none are priced", () => {
    const ps = [
      printing({ id: 1, setCode: "ltr", priceUsd: 5 }),
      printing({ id: 4, setCode: "dom" }),
      printing({ id: 2, setCode: "war" }),
    ];
    expect(selectPrintingId(ps, "no-universes-beyond", 1)).toBe(2);
  });

  it("returns null when the current printing isn't in the list", () => {
    const ps = [printing({ id: 1, setCode: "dom", priceUsd: 8 })];
    expect(selectPrintingId(ps, "no-universes-beyond", null)).toBeNull();
  });
});
