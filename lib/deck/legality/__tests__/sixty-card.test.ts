import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Legalities } from "@/lib/card/types-meta";
import { snapshotFromCards } from "@/lib/deck/mutation/snapshot";
import { fullLegality } from "@/lib/deck/legality";
import type { SnapshotCard } from "@/lib/deck/mutation/types";

function dc(
  id: string,
  cardId: number,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
  legalities: Legalities = { modern: "legal" },
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
    legalities,
    printingId: null,
    isFoil: false,
  };
}

describe("sixty-card rules — deck size", () => {
  it("flags mainboard < 60", () => {
    const snap = snapshotFromCards({
      format: Format.MODERN,
      cards: [dc("dc-1", 1, "Lightning Bolt", 4)],
    });
    const issues = fullLegality(snap);
    const issue = issues.find((i) => i.kind === "deck_size");
    expect(issue).toBeDefined();
    expect(issue?.kind === "deck_size" && issue.expected).toBe(60);
  });

  it("does not flag mainboard >= 60", () => {
    const snap = snapshotFromCards({
      format: Format.MODERN,
      cards: [dc("dc-1", 1, "Lightning Bolt", 60)],
    });
    expect(
      fullLegality(snap).some((i) => i.kind === "deck_size"),
    ).toBe(false);
  });
});

describe("sixty-card rules — sideboard size", () => {
  it("flags sideboard > 15", () => {
    const snap = snapshotFromCards({
      format: Format.MODERN,
      cards: [
        dc("dc-1", 1, "A", 60),
        dc("dc-2", 2, "B", 16, Zone.SIDEBOARD),
      ],
    });
    expect(
      fullLegality(snap).some((i) => i.kind === "sideboard_size"),
    ).toBe(true);
  });

  it("does not flag sideboard <= 15", () => {
    const snap = snapshotFromCards({
      format: Format.MODERN,
      cards: [
        dc("dc-1", 1, "A", 60),
        dc("dc-2", 2, "B", 15, Zone.SIDEBOARD),
      ],
    });
    expect(
      fullLegality(snap).some((i) => i.kind === "sideboard_size"),
    ).toBe(false);
  });
});
