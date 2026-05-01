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
): SnapshotCard {
  return {
    id,
    cardId,
    cardName: name,
    quantity,
    zone,
    category: null,
    typeLine: "Creature — Human",
    colorIdentity: [],
    legalities: { brawl: "legal" },
    printingId: null,
    isFoil: false,
  };
}

describe("brawl rules", () => {
  it("flags duplicate non-basics (singleton)", () => {
    const snap = snapshotFromCards({
      format: Format.BRAWL,
      cards: [dc("dc-1", 1, "Sol Ring", 2)],
    });
    expect(
      fullLegality(snap).some((i) => i.code === "singleton_violation"),
    ).toBe(true);
  });

  it("does not enforce deck size (no deck_size rule for Brawl)", () => {
    const snap = snapshotFromCards({
      format: Format.BRAWL,
      cards: Array.from({ length: 5 }, (_, i) =>
        dc(`dc-${i}`, i + 1, `Card ${i}`, 1),
      ),
    });
    expect(fullLegality(snap).some((i) => i.code === "deck_size")).toBe(false);
  });
});
