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
  zone: Zone = Zone.MAINBOARD,
): ExistingDeckCard {
  return { deckCardId, cardId, zone, quantity };
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
        categories: [],
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
        categories: [],
      },
    ]);
  });

  it("picks the lowest deckCardId as primary and removes duplicate extras", () => {
    // Two existing rows for cardId=1 in MAINBOARD. Sort is by deckCardId, so
    // dc-a is primary. Desired qty=2 matches dc-b's quantity, but primary
    // takes precedence — emits update on dc-a + remove of dc-b.
    const changes = diffDeck(
      [resolved(1, "Forest", 2)],
      [existing("dc-b", 1, 2), existing("dc-a", 1, 1)],
    );
    expect(changes).toContainEqual({
      op: "update",
      deckCardId: "dc-a",
      quantity: 2,
    });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-b" });
  });

  it("removes existing primary AND its extras when no desired entry matches the key", () => {
    const changes = diffDeck(
      [],
      [existing("dc-primary", 1, 2), existing("dc-extra", 1, 1)],
    );
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-primary" });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-extra" });
  });

  it("sorts existing duplicates deterministically by deckCardId regardless of input order", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 5)],
      [existing("dc-z", 1, 1), existing("dc-a", 1, 2)],
    );
    expect(changes).toContainEqual({
      op: "update",
      deckCardId: "dc-a",
      quantity: 5,
    });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-z" });
    expect(changes.filter((c) => c.op === "update")).toHaveLength(1);
    expect(changes.filter((c) => c.op === "remove")).toHaveLength(1);
  });

  it("carries first-occurrence categories onto MAINBOARD add ops", () => {
    const r = resolved(1, "Sol Ring", 1);
    (r.parsed as { categories?: string[] }).categories = ["ramp", "rocks"];
    const changes = diffDeck([r], []);
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: ["ramp", "rocks"],
      },
    ]);
  });

  it("clears categories on non-MAINBOARD add ops", () => {
    const r = resolved(2, "Duress", 1, Zone.SIDEBOARD);
    (r.parsed as { categories?: string[] }).categories = ["discard"];
    const changes = diffDeck([r], []);
    expect(changes).toEqual([
      {
        op: "add",
        cardId: 2,
        quantity: 1,
        zone: Zone.SIDEBOARD,
        categories: [],
      },
    ]);
  });

  it("keeps the categorized duplicate even when its deckCardId sorts later", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 2)],
      [
        existing("dc-a", 1, 1),
        { ...existing("dc-z", 1, 2), hasCategories: true },
      ],
    );
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc-a" });
    expect(changes.filter((c) => c.op === "remove")).toHaveLength(1);
    // dc-z survives as primary; its quantity already matches → no update.
    expect(changes.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("treats different zones for the same card as distinct keys", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 2, Zone.MAINBOARD)],
      [existing("dc1", 1, 1, Zone.SIDEBOARD)],
    );
    expect(changes).toContainEqual({
      op: "add",
      cardId: 1,
      quantity: 2,
      zone: Zone.MAINBOARD,
      categories: [],
    });
    expect(changes).toContainEqual({ op: "remove", deckCardId: "dc1" });
  });
});
