import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { planPackageApply, type PackageCard } from "../package";

function pkgCard(overrides: Partial<PackageCard> = {}): PackageCard {
  return {
    cardId: 1,
    cardName: "Sol Ring",
    typeLine: "Artifact",
    zone: Zone.MAINBOARD,
    quantity: 1,
    printingId: null,
    isFoil: false,
    categories: [],
    ...overrides,
  };
}

describe("planPackageApply", () => {
  it("keeps the package's zone, categories, printing, and foil", () => {
    const { changes, skipped } = planPackageApply(
      [
        pkgCard({ categories: ["ramp", "staples"], printingId: 7, isFoil: true }),
        pkgCard({ cardId: 2, cardName: "Duress", zone: Zone.SIDEBOARD }),
      ],
      new Set(),
      Format.MODERN,
    );

    expect(skipped).toEqual([]);
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: ["ramp", "staples"],
        printingId: 7,
        isFoil: true,
      },
      {
        op: "add",
        cardId: 2,
        quantity: 1,
        zone: Zone.SIDEBOARD,
        categories: [],
        printingId: null,
        isFoil: false,
      },
    ]);
  });

  it("skips cards the deck already contains in any zone", () => {
    const { changes, skipped } = planPackageApply(
      [pkgCard(), pkgCard({ cardId: 2, cardName: "Arcane Signet" })],
      new Set([1]),
      Format.COMMANDER,
    );

    expect(changes.map((c) => c.op === "add" && c.cardId)).toEqual([2]);
    expect(skipped).toEqual(["Sol Ring"]);
  });

  it("lands command-zone package cards in the mainboard", () => {
    const { changes } = planPackageApply(
      [
        pkgCard({ zone: Zone.COMMANDER }),
        pkgCard({ cardId: 2, cardName: "Lurrus", zone: Zone.COMPANION }),
      ],
      new Set(),
      Format.COMMANDER,
    );

    expect(changes.map((c) => c.op === "add" && c.zone)).toEqual([
      Zone.MAINBOARD,
      Zone.MAINBOARD,
    ]);
  });

  it("caps non-basic quantities at one and dedupes across zones in singleton formats", () => {
    const { changes, skipped } = planPackageApply(
      [
        pkgCard({ quantity: 4 }),
        pkgCard({ zone: Zone.CONSIDERING }),
        pkgCard({
          cardId: 3,
          cardName: "Island",
          typeLine: "Basic Land — Island",
          quantity: 5,
        }),
      ],
      new Set(),
      Format.COMMANDER,
    );

    expect(
      changes.map((c) => c.op === "add" && [c.cardId, c.quantity, c.zone]),
    ).toEqual([
      [1, 1, Zone.MAINBOARD],
      [3, 5, Zone.MAINBOARD],
    ]);
    expect(skipped).toEqual(["Sol Ring"]);
  });

  it("keeps playsets intact in non-singleton formats", () => {
    const { changes } = planPackageApply(
      [pkgCard({ quantity: 4 })],
      new Set(),
      Format.MODERN,
    );

    expect(changes.map((c) => c.op === "add" && c.quantity)).toEqual([4]);
  });
});
