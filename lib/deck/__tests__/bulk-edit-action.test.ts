import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
    card: { findMany: vi.fn() },
    deckCard: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/deck/mutation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deck/mutation")>(
    "@/lib/deck/mutation",
  );
  return {
    ...actual,
    applyChanges: vi.fn(async () => undefined),
  };
});

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { type BulkChange } from "@/lib/deck/editor-actions";
import { applyChanges } from "@/lib/deck/mutation";
import { diffDeck, type ExistingDeckCard } from "../bulk-edit-diff";
import { bulkReplaceDeck } from "../bulk-edit-action";
import { Zone } from "@/lib/generated/prisma/enums";
import type { ResolvedCard } from "@/lib/deck-io/resolve";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockApply = vi.mocked(applyChanges);

const USER_ID = "user-1";
const DECK_ID = "deck-1";

function asOwner() {
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
}

function asOutsider() {
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);
}

function resolved(
  cardId: number,
  name: string,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
): ResolvedCard {
  return {
    parsed: { name, quantity, zone, category: null, isFoil: false },
    cardId,
    matchedName: name,
    match: { kind: "exact" },
    printingId: null,
    isFoil: false,
  };
}

function existing(
  deckCardId: string,
  cardId: number,
  quantity: number,
  zone: Zone = Zone.MAINBOARD,
  category: string | null = null,
): ExistingDeckCard {
  return { deckCardId, cardId, zone, category, quantity };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// diffDeck (pure)
// ---------------------------------------------------------------------------

describe("diffDeck", () => {
  it("emits an update op (preserving deckCardId) when quantity increases", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 5)],
      [existing("dc-1", 1, 1)],
    );
    expect(changes).toEqual<BulkChange[]>([
      { op: "update", deckCardId: "dc-1", quantity: 5 },
    ]);
  });

  it("emits an update op when quantity decreases", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 1)],
      [existing("dc-1", 1, 4)],
    );
    expect(changes).toEqual<BulkChange[]>([
      { op: "update", deckCardId: "dc-1", quantity: 1 },
    ]);
  });

  it("preserves category by no-op when quantity is unchanged", () => {
    const changes = diffDeck(
      [resolved(1, "Sol Ring", 1)],
      [existing("dc-1", 1, 1, Zone.MAINBOARD, "Ramp")],
    );
    expect(changes).toEqual([]);
  });

  it("emits a remove op for an existing card no longer in the desired text", () => {
    const changes = diffDeck([], [existing("dc-1", 1, 1)]);
    expect(changes).toEqual<BulkChange[]>([
      { op: "remove", deckCardId: "dc-1" },
    ]);
  });

  it("emits an add op with category: null for a brand-new line", () => {
    const changes = diffDeck([resolved(2, "Sol Ring", 1)], []);
    expect(changes).toEqual<BulkChange[]>([
      {
        op: "add",
        cardId: 2,
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
  });

  it("treats a cross-zone move as remove + add (printing/foil are dropped)", () => {
    const changes = diffDeck(
      [resolved(1, "Force of Will", 1, Zone.SIDEBOARD)],
      [existing("dc-1", 1, 1, Zone.MAINBOARD, "Counters")],
    );
    expect(changes).toContainEqual({
      op: "remove",
      deckCardId: "dc-1",
    });
    expect(changes).toContainEqual({
      op: "add",
      cardId: 1,
      quantity: 1,
      zone: Zone.SIDEBOARD,
      category: null,
    });
    expect(changes).toHaveLength(2);
  });

  it("collapses duplicate lines of the same card into a single desired quantity", () => {
    const changes = diffDeck(
      [resolved(1, "Forest", 2), resolved(1, "Forest", 3)],
      [],
    );
    expect(changes).toEqual<BulkChange[]>([
      {
        op: "add",
        cardId: 1,
        quantity: 5,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
  });

  it("ignores unmatched (cardId === null) entries when building the desired set", () => {
    const unmatched: ResolvedCard = {
      parsed: {
        name: "Not A Real Card",
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: null,
        isFoil: false,
      },
      cardId: null,
      matchedName: null,
      match: { kind: "none" },
      printingId: null,
      isFoil: false,
    };
    const changes = diffDeck([unmatched], []);
    expect(changes).toEqual([]);
  });

  it("prefers the categorized row as primary and removes uncategorized duplicates", () => {
    // Same (cardId, zone) but two existing rows: one in 'Ramp', one uncategorized.
    // Quantity unchanged → categorized row survives, extra is removed.
    const changes = diffDeck(
      [resolved(1, "Sol Ring", 1)],
      [
        existing("dc-uncat", 1, 1, Zone.MAINBOARD, null),
        existing("dc-ramp", 1, 1, Zone.MAINBOARD, "Ramp"),
      ],
    );
    expect(changes).toEqual<BulkChange[]>([
      { op: "remove", deckCardId: "dc-uncat" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// bulkReplaceDeck (server action)
// ---------------------------------------------------------------------------

describe("bulkReplaceDeck", () => {
  it("404s for non-owners", async () => {
    asOutsider();
    await expect(bulkReplaceDeck(DECK_ID, "")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("returns counts and unmatched names; skips bulkUpdateDeck when no changes", async () => {
    asOwner();
    // Existing: 1x Forest. Desired text: 1x Forest. No diff.
    mockCardFindMany.mockResolvedValue([
      { id: 1, name: "Forest" },
    ] as never);
    mockDeckCardFindMany.mockResolvedValue([
      { id: "dc-1", cardId: 1, zone: Zone.MAINBOARD, category: null, quantity: 1 },
    ] as never);

    const result = await bulkReplaceDeck(DECK_ID, "1 Forest");

    expect(result).toEqual({
      added: 0,
      removed: 0,
      updated: 0,
      unmatchedNames: [],
      warnings: [],
    });
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("delegates a non-empty change set to bulkUpdateDeck and reports counts", async () => {
    asOwner();
    // Existing has Forest x1; desired bumps Forest to x4 and adds Sol Ring x1.
    mockCardFindMany
      // Exact match call in resolveCards
      .mockResolvedValueOnce([
        { id: 1, name: "Forest" },
        { id: 2, name: "Sol Ring" },
      ] as never);
    mockDeckCardFindMany.mockResolvedValue([
      { id: "dc-1", cardId: 1, zone: Zone.MAINBOARD, category: null, quantity: 1 },
    ] as never);

    const result = await bulkReplaceDeck(DECK_ID, "4 Forest\n1 Sol Ring");

    expect(mockApply).toHaveBeenCalledTimes(1);
    const [, , changes] = mockApply.mock.calls[0]!;
    expect(changes).toContainEqual({
      op: "update",
      deckCardId: "dc-1",
      quantity: 4,
    });
    expect(changes).toContainEqual({
      op: "add",
      cardId: 2,
      quantity: 1,
      zone: Zone.MAINBOARD,
      category: null,
    });
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.removed).toBe(0);
  });

  it("returns unmatched card names without generating an add op", async () => {
    asOwner();
    // Forest resolves; "Not A Real Card" does not (no exact, no fuzzy prefix).
    mockCardFindMany
      .mockResolvedValueOnce([{ id: 1, name: "Forest" }] as never)
      // Fuzzy lookup for the unmatched name
      .mockResolvedValueOnce([] as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);

    const result = await bulkReplaceDeck(
      DECK_ID,
      "1 Forest\n1 Not A Real Card Xyz",
    );

    expect(result.unmatchedNames).toEqual(["Not A Real Card Xyz"]);
    const [, , changes] = mockApply.mock.calls[0]!;
    // Only the Forest add — no add for the unmatched name.
    expect(changes).toEqual<BulkChange[]>([
      {
        op: "add",
        cardId: 1,
        quantity: 1,
        zone: Zone.MAINBOARD,
        category: null,
      },
    ]);
    expect(result.added).toBe(1);
  });
});
