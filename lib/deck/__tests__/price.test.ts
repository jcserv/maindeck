import { describe, expect, it } from "vitest";
import { computeDeckPrice } from "../price";

type TestPrinting = {
  priceUsd: number | null;
  priceUsdFoil: number | null;
  priceEur: number | null;
  priceEurFoil: number | null;
};

function makePrinting(overrides: Partial<TestPrinting> = {}): TestPrinting {
  return {
    priceUsd: null,
    priceUsdFoil: null,
    priceEur: null,
    priceEurFoil: null,
    ...overrides,
  };
}

function dec(value: number): number {
  return value;
}

describe("computeDeckPrice", () => {
  it("returns zero totals and zero missingCount for empty deck", () => {
    expect(computeDeckPrice([])).toEqual({ usd: 0, eur: 0, missingCount: 0 });
  });

  it("sums prices correctly when all cards have printings", () => {
    const cards = [
      {
        quantity: 2,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(1.5), priceEur: dec(1.0) }),
      },
      {
        quantity: 3,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(2.0), priceEur: dec(1.5) }),
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 9,
      eur: 6.5,
      missingCount: 0,
    });
  });

  it("counts missing printings and contributes 0 to totals", () => {
    const cards = [
      {
        quantity: 4,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(1.0), priceEur: dec(0.8) }),
      },
      {
        quantity: 1,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: null,
      },
      {
        quantity: 2,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: null,
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 4,
      eur: 3.2,
      missingCount: 2,
    });
  });

  it("uses foil prices for foil rows when available", () => {
    const cards = [
      {
        quantity: 1,
        zone: "MAINBOARD" as const,
        isFoil: true,
        printing: makePrinting({
          priceUsd: dec(1.0),
          priceUsdFoil: dec(5.0),
          priceEur: dec(0.8),
          priceEurFoil: dec(4.0),
        }),
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 5.0,
      eur: 4.0,
      missingCount: 0,
    });
  });

  it("falls back to non-foil price when foil price is unavailable", () => {
    const cards = [
      {
        quantity: 1,
        zone: "MAINBOARD" as const,
        isFoil: true,
        printing: makePrinting({
          priceUsd: dec(2.0),
          priceUsdFoil: null,
          priceEur: dec(1.5),
          priceEurFoil: null,
        }),
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 2.0,
      eur: 1.5,
      missingCount: 0,
    });
  });

  it("excludes SIDEBOARD zone from totals and missingCount", () => {
    const cards = [
      {
        quantity: 2,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(1.0), priceEur: dec(0.5) }),
      },
      {
        quantity: 5,
        zone: "SIDEBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(10.0), priceEur: dec(8.0) }),
      },
      {
        quantity: 3,
        zone: "SIDEBOARD" as const,
        isFoil: false,
        printing: null,
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 2.0,
      eur: 1.0,
      missingCount: 0,
    });
  });

  it("excludes CONSIDERING zone from totals and missingCount", () => {
    const cards = [
      {
        quantity: 1,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(3.0), priceEur: dec(2.5) }),
      },
      {
        quantity: 4,
        zone: "CONSIDERING" as const,
        isFoil: false,
        printing: null,
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 3.0,
      eur: 2.5,
      missingCount: 0,
    });
  });

  it("includes COMMANDER zone in totals", () => {
    const cards = [
      {
        quantity: 1,
        zone: "COMMANDER" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(25.0), priceEur: dec(20.0) }),
      },
      {
        quantity: 1,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(1.0), priceEur: dec(0.5) }),
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 26.0,
      eur: 20.5,
      missingCount: 0,
    });
  });

  it("multiplies prices by quantity", () => {
    const cards = [
      {
        quantity: 4,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: dec(0.25), priceEur: dec(0.20) }),
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 1.0,
      eur: 0.8,
      missingCount: 0,
    });
  });

  it("returns 0 when foil row has neither foil nor non-foil prices", () => {
    const cards = [
      {
        quantity: 2,
        zone: "MAINBOARD" as const,
        isFoil: true,
        printing: makePrinting({
          priceUsd: null,
          priceUsdFoil: null,
          priceEur: null,
          priceEurFoil: null,
        }),
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 0,
      eur: 0,
      missingCount: 0,
    });
  });

  it("treats null prices on printing as 0 without incrementing missingCount", () => {
    const cards = [
      {
        quantity: 2,
        zone: "MAINBOARD" as const,
        isFoil: false,
        printing: makePrinting({ priceUsd: null, priceEur: null }),
      },
    ];

    expect(computeDeckPrice(cards)).toEqual({
      usd: 0,
      eur: 0,
      missingCount: 0,
    });
  });
});
