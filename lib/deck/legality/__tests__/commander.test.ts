import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { snapshotFromCards } from "@/lib/deck/mutation/snapshot";
import { fullLegality } from "@/lib/deck/legality";
import type { SnapshotCard } from "@/lib/deck/mutation/types";

function dc(
  id: string,
  cardId: number,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
  typeLine: string | null = "Creature — Human",
  colorIdentity: string[] = [],
): SnapshotCard {
  return {
    id,
    cardId,
    cardName: name,
    quantity,
    zone,
    categories: [],
    typeLine,
    colorIdentity,
    legalities: { commander: "legal" },
    printingId: null,
    isFoil: false,
  };
}

describe("commander rules — singleton", () => {
  it("flags duplicate non-basics in mainboard", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Sol Ring", 2)],
    });
    const issues = fullLegality(snap);
    expect(issues.some((i) => i.kind === "singleton_violation")).toBe(true);
  });

  it("does not flag basic lands", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Forest", 30, Zone.MAINBOARD, "Basic Land — Forest")],
    });
    const issues = fullLegality(snap);
    expect(issues.some((i) => i.kind === "singleton_violation")).toBe(false);
  });
});

describe("commander rules — color identity", () => {
  it("flags off-identity card under a B/G commander", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [
        dc(
          "dc-1",
          1,
          "Baba Lysaga",
          1,
          Zone.COMMANDER,
          "Legendary Creature",
          ["B", "G"],
        ),
        dc("dc-2", 2, "Wrath of God", 1, Zone.MAINBOARD, "Sorcery", ["W"]),
      ],
    });
    const issues = fullLegality(snap);
    expect(issues.some((i) => i.kind === "color_identity_violation")).toBe(
      true,
    );
  });
});

describe("commander rules — deck size", () => {
  it("flags decks not equal to 100 cards", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: [dc("dc-1", 1, "Commander", 1, Zone.COMMANDER)],
    });
    const issues = fullLegality(snap);
    const size = issues.find((i) => i.kind === "deck_size");
    expect(size?.kind === "deck_size" && size.actual).toBe(1);
  });

  it("flags missing commander zone", () => {
    const snap = snapshotFromCards({
      format: Format.COMMANDER,
      cards: Array.from({ length: 100 }, (_, i) =>
        dc(`dc-${i}`, i + 1, `Card ${i}`, 1),
      ),
    });
    const issues = fullLegality(snap);
    expect(issues.some((i) => i.kind === "no_commander")).toBe(true);
  });
});
