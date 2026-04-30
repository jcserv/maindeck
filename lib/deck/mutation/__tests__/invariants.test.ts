import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { checkInvariants, projectChanges } from "../invariants";
import type {
  DeckSnapshot,
  PlannedChange,
  SnapshotCard,
} from "../types";

function snap(
  cards: SnapshotCard[],
  format: Format = Format.COMMANDER,
  extraMeta: Array<{
    cardId: number;
    name: string;
    typeLine: string | null;
    colorIdentity?: string[];
    legalities?: Record<string, string>;
  }> = [],
): DeckSnapshot {
  const cardMeta = new Map<
    number,
    {
      name: string;
      typeLine: string | null;
      colorIdentity: string[];
      legalities: Record<string, string>;
    }
  >();
  for (const c of cards) {
    cardMeta.set(c.cardId, {
      name: c.cardName,
      typeLine: c.typeLine,
      colorIdentity: c.colorIdentity,
      legalities: c.legalities,
    });
  }
  for (const m of extraMeta) {
    cardMeta.set(m.cardId, {
      name: m.name,
      typeLine: m.typeLine,
      colorIdentity: m.colorIdentity ?? [],
      legalities: m.legalities ?? {},
    });
  }
  return {
    deckId: "deck-1",
    format,
    cards,
    categoryNames: [],
    cardMeta,
  };
}

function dc(
  id: string,
  cardId: number,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
  typeLine: string | null = "Creature — Human",
): SnapshotCard {
  return {
    id,
    cardId,
    cardName: name,
    quantity,
    zone,
    category: null,
    typeLine,
    colorIdentity: [],
    legalities: { commander: "legal" },
    printingId: null,
    isFoil: false,
  };
}

describe("projectChanges", () => {
  it("appends a new card row on add when no existing match", () => {
    const before = snap([], Format.COMMANDER, [
      { cardId: 1, name: "Counterspell", typeLine: "Instant" },
    ]);
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
    ];
    const after = projectChanges(before, changes);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]).toMatchObject({ cardId: 1, quantity: 1 });
  });

  it("increments quantity on add when row exists at same key", () => {
    const before = snap([dc("dc-1", 1, "Forest", 4)]);
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, category: null },
    ];
    const after = projectChanges(before, changes);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(6);
  });

  it("removes a row on remove op", () => {
    const before = snap([dc("dc-1", 1, "Forest", 4)]);
    const after = projectChanges(before, [
      { op: "remove", deckCardId: "dc-1" },
    ]);
    expect(after.cards).toHaveLength(0);
  });

  it("update with quantity <= 0 deletes the row", () => {
    const before = snap([dc("dc-1", 1, "Forest", 4)]);
    const after = projectChanges(before, [
      { op: "update", deckCardId: "dc-1", quantity: 0 },
    ]);
    expect(after.cards).toHaveLength(0);
  });

  it("move merges into existing target row", () => {
    const before = snap([
      dc("dc-1", 1, "Sol Ring", 1, Zone.SIDEBOARD),
      dc("dc-2", 1, "Sol Ring", 1, Zone.MAINBOARD),
    ]);
    const after = projectChanges(before, [
      { op: "move", deckCardId: "dc-1", zone: Zone.MAINBOARD, category: null },
    ]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.quantity).toBe(2);
  });
});

describe("checkInvariants — singleton", () => {
  it("flags a NEW singleton violation introduced by add", () => {
    const before = snap([dc("dc-1", 1, "Sol Ring", 1)]);
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, category: null },
    ];
    const after = projectChanges(before, changes);
    const issues = checkInvariants(before, after, changes);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.code).toBe("singleton_violation");
  });

  it("does not flag a basic land duplicate in singleton format", () => {
    const before = snap([dc("dc-1", 1, "Forest", 1, Zone.MAINBOARD, "Basic Land — Forest")]);
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 5, zone: Zone.MAINBOARD, category: null },
    ];
    const after = projectChanges(before, changes);
    const issues = checkInvariants(before, after, changes);
    expect(issues).toHaveLength(0);
  });

  it("does not gate writes for non-singleton formats", () => {
    const before = snap([dc("dc-1", 1, "Lightning Bolt", 4)], Format.MODERN);
    const changes: PlannedChange[] = [
      { op: "add", cardId: 1, quantity: 4, zone: Zone.MAINBOARD, category: null },
    ];
    const after = projectChanges(before, changes);
    const issues = checkInvariants(before, after, changes);
    expect(issues).toHaveLength(0);
  });

  it("does not re-flag pre-existing violations", () => {
    // Already 2 copies — singleton violation exists. Adding an unrelated
    // legal card should not throw.
    const before = snap(
      [
        dc("dc-1", 1, "Sol Ring", 2),
        dc("dc-2", 2, "Mana Vault", 1),
      ],
      Format.COMMANDER,
      [{ cardId: 3, name: "Counterspell", typeLine: "Instant" }],
    );
    const changes: PlannedChange[] = [
      { op: "add", cardId: 3, quantity: 1, zone: Zone.MAINBOARD, category: null },
    ];
    const after = projectChanges(before, changes);
    const issues = checkInvariants(before, after, changes);
    expect(issues).toHaveLength(0);
  });
});

describe("checkInvariants — structural", () => {
  it("rejects category != null for non-MAINBOARD add", () => {
    const before = snap([], Format.COMMANDER, [
      { cardId: 1, name: "Counterspell", typeLine: "Instant" },
    ]);
    const changes: PlannedChange[] = [
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.SIDEBOARD,
        category: "Counters",
      },
    ];
    const after = projectChanges(before, changes);
    const issues = checkInvariants(before, after, changes);
    expect(issues.some((i) => i.code === "category_zone_mismatch")).toBe(true);
  });

  it("rejects category != null on move to non-MAINBOARD", () => {
    const before = snap([dc("dc-1", 1, "Sol Ring", 1)]);
    const changes: PlannedChange[] = [
      {
        op: "move",
        deckCardId: "dc-1",
        zone: Zone.SIDEBOARD,
        category: "Ramp",
      },
    ];
    const after = projectChanges(before, changes);
    const issues = checkInvariants(before, after, changes);
    expect(issues.some((i) => i.code === "category_zone_mismatch")).toBe(true);
  });
});
