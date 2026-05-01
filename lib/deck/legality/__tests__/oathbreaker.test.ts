import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { snapshotFromCards } from "@/lib/deck/mutation/snapshot";
import { fullLegality } from "@/lib/deck/mutation/legality-rules";
import type { SnapshotCard } from "@/lib/deck/mutation/types";

function dc(
  id: string,
  cardId: number,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
  colorIdentity: string[] = [],
): SnapshotCard {
  return {
    id,
    cardId,
    cardName: name,
    quantity,
    zone,
    category: null,
    typeLine: "Creature — Human",
    colorIdentity,
    legalities: { oathbreaker: "legal" },
    printingId: null,
    isFoil: false,
  };
}

describe("oathbreaker rules", () => {
  it("flags duplicate non-basics (singleton)", () => {
    const snap = snapshotFromCards({
      format: Format.OATHBREAKER,
      cards: [dc("dc-1", 1, "Sol Ring", 2)],
    });
    expect(
      fullLegality(snap).some((i) => i.code === "singleton_violation"),
    ).toBe(true);
  });

  it("flags off-identity cards under a commander", () => {
    const snap = snapshotFromCards({
      format: Format.OATHBREAKER,
      cards: [
        dc("dc-1", 1, "Oathbreaker", 1, Zone.COMMANDER, ["U"]),
        dc("dc-2", 2, "Pyroblast", 1, Zone.MAINBOARD, ["R"]),
      ],
    });
    expect(
      fullLegality(snap).some((i) => i.code === "color_identity_violation"),
    ).toBe(true);
  });
});
