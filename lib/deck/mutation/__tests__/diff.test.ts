import { describe, expect, it } from "vitest";
import { Zone } from "@/lib/generated/prisma/enums";
import { diffDeck, type ExistingDeckCard } from "../diff";
import type { ResolvedCard } from "@/lib/deck/io/resolve";

function resolved(
  cardId: number | null,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
): ResolvedCard {
  return {
    cardId,
    parsed: {
      name,
      quantity,
      zone,
      category: null,
      isFoil: false,
    },
    printingId: null,
    isFoil: false,
  } as unknown as ResolvedCard;
}

function existing(
  deckCardId: string,
  cardId: number,
  quantity: number,
  category: string | null = null,
  zone: Zone = Zone.MAINBOARD,
): ExistingDeckCard {
  return { deckCardId, cardId, zone, category, quantity };
}

describe("diffDeck", () => {
  it("emits add for desired entries with no existing match", () => {
    const changes = diffDeck([resolved(1, "Forest", 4)], []);
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 1,
        quantity: 4,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
  });

  it("skips resolved entries with cardId=null", () => {
    const changes = diffDeck([resolved(null, "Unknown", 1)], []);
    expect(changes).toEqual([]);
  });

  it("emits update when desired quantity differs from existing primary", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 4)],
      [existing("dc1", 1, 2)],
    );
    expect(changes).toEqual([
      { op: "update", deckCardId: "dc1", quantity: 4 },
    ]);
  });

  it("emits no change when desired quantity matches existing primary", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 4)],
      [existing("dc1", 1, 4)],
    );
    expect(changes).toEqual([]);
  });

  it("aggregates duplicate desired entries with same key", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 2), resolved(1, "Forest", 2)],
      [],
    );
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 1,
        quantity: 4,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
  });

  it("uses the primary (categorized first) and removes duplicate extras when desired matches the primary", () => {
    // Two existing rows for cardId=1 in MAINBOARD: one categorized, one not.
    // Sort puts categorized first as primary. Desired qty=2 matches no-cat row's qty,
    // but primary (cat=Ramp, qty=1) takes precedence — emits update + remove.
    const changes = diffDeck(
      [resolved(1, "Forest", 2)],
      [
        existing("dc-no-cat", 1, 2, null),
        existing("dc-ramp", 1, 1, "Ramp"),
      ],
    );
    // Primary is dc-ramp (categorized → sort key 0). qty 1 → 2: update.
    // Extras = [dc-no-cat]: remove.
    expect(changes).toContainEqual({
      op: "update",
      deckCardId: "dc-ramp",
      quantity: 2,
    });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-no-cat" });
  });

  it("removes existing primary AND its extras when no desired entry matches the key", () => {
    const changes = diffDeck(
      [],
      [
        existing("dc-primary", 1, 2, "Ramp"),
        existing("dc-extra", 1, 1, null),
      ],
    );
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-primary" });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-extra" });
  });

  it("sorts existing duplicates with the same categorized-status by category name", () => {
    // Both rows have non-null categories — primary should be the lexicographically
    // first one ("Burn" before "Ramp"); the other becomes an extra to remove.
    const changes = diffDeck(
      [resolved(1, "Forest", 5)],
      [
        existing("dc-ramp", 1, 1, "Ramp"),
        existing("dc-burn", 1, 1, "Burn"),
      ],
    );
    expect(changes).toContainEqual({
      op: "update",
      deckCardId: "dc-burn",
      quantity: 5,
    });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-ramp" });
  });

  it("sorts existing duplicates with both categories null via the empty-string fallback", () => {
    // Both rows have category=null and same key, so the categorized-status sort
    // is a no-op and both `?? ""` fallbacks are exercised before localeCompare.
    const changes = diffDeck(
      [resolved(1, "Forest", 5)],
      [
        existing("dc-a", 1, 1, null),
        existing("dc-b", 1, 2, null),
      ],
    );
    // After sort, one is primary and the other is extra. Quantity goes to 5,
    // and the extra is removed regardless of which becomes primary.
    expect(changes.filter((c) => c.op === "update")).toHaveLength(1);
    expect(changes.filter((c) => c.op === "remove")).toHaveLength(1);
  });

  it("treats different zones for the same card as distinct keys", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 2, Zone.MAINBOARD)],
      [existing("dc1", 1, 1, null, Zone.SIDEBOARD)],
    );
    expect(changes).toContainEqual({
      op: "add",
      cardId: 1,
      quantity: 2,
      zone: Zone.MAINBOARD,
      category: null,
    });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc1" });
  });
});
