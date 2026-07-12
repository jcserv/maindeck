import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
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
import { Zone } from "@/lib/generated/prisma/client";
import {
  applyChanges,
  InvariantViolation,
  type PlannedChange,
} from "@/lib/deck/mutation";
import {
  addCardsToDeck,
  addCardToDeck,
  bulkUpdateDeck,
  removeCardFromDeck,
  updateCardQuantity,
} from "../editor-actions";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
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

function changesPassedToApply(): PlannedChange[] {
  expect(mockApply).toHaveBeenCalledTimes(1);
  const [, , changes] = mockApply.mock.calls[0]!;
  return changes;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApply.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// addCardToDeck
// ---------------------------------------------------------------------------

describe("addCardToDeck", () => {
  it("forwards an add op with the requested zone, categories, and quantity", async () => {
    asOwner();

    await addCardToDeck(DECK_ID, 42, { quantity: 3, categories: ["Ramp"] });

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      {
        op: "add",
        cardId: 42,
        quantity: 3,
        zone: Zone.MAINBOARD,
        categories: ["Ramp"],
      },
    ]);
  });

  it("defaults to MAINBOARD/no categories and quantity 1", async () => {
    asOwner();

    await addCardToDeck(DECK_ID, 42);

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      {
        op: "add",
        cardId: 42,
        quantity: 1,
        zone: Zone.MAINBOARD,
        categories: [],
      },
    ]);
  });

  it("swallows InvariantViolation so the action is a silent no-op", async () => {
    asOwner();
    mockApply.mockRejectedValueOnce(
      new InvariantViolation([
        { kind: "singleton_violation", cardName: "Sol Ring", quantity: 2 },
      ]),
    );

    await expect(addCardToDeck(DECK_ID, 42)).resolves.toBeUndefined();
  });

  it("propagates non-InvariantViolation errors", async () => {
    asOwner();
    mockApply.mockRejectedValueOnce(new Error("boom"));

    await expect(addCardToDeck(DECK_ID, 42)).rejects.toThrow("boom");
  });

  it("rejects a category on a non-MAINBOARD zone before invoking applyChanges", async () => {
    asOwner();

    await expect(
      addCardToDeck(DECK_ID, 42, { zone: Zone.SIDEBOARD, categories: ["Ramp"] }),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(addCardToDeck(DECK_ID, 42)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockApply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addCardsToDeck
// ---------------------------------------------------------------------------

describe("addCardsToDeck", () => {
  it("maps each card to an add op in one applyChanges call", async () => {
    asOwner();

    await addCardsToDeck(DECK_ID, [
      { cardId: 1, quantity: 2 },
      { cardId: 2 },
    ]);

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      { op: "add", cardId: 1, quantity: 2, zone: Zone.MAINBOARD, categories: [] },
      { op: "add", cardId: 2, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
    ]);
  });

  it("per-card zone/categories win over the shared opts fallback", async () => {
    asOwner();

    await addCardsToDeck(
      DECK_ID,
      [
        { cardId: 1, zone: Zone.SIDEBOARD },
        { cardId: 2, categories: ["Ramp"] },
      ],
      { zone: Zone.MAINBOARD },
    );

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      { op: "add", cardId: 1, quantity: 1, zone: Zone.SIDEBOARD, categories: [] },
      { op: "add", cardId: 2, quantity: 1, zone: Zone.MAINBOARD, categories: ["Ramp"] },
    ]);
  });

  it("falls back to opts zone/categories when a card omits them", async () => {
    asOwner();

    await addCardsToDeck(DECK_ID, [{ cardId: 7 }], {
      zone: Zone.MAINBOARD,
      categories: ["Lands"],
    });

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      { op: "add", cardId: 7, quantity: 1, zone: Zone.MAINBOARD, categories: ["Lands"] },
    ]);
  });

  it("rejects a category on a non-MAINBOARD zone before invoking applyChanges", async () => {
    asOwner();

    await expect(
      addCardsToDeck(DECK_ID, [
        { cardId: 1, zone: Zone.SIDEBOARD, categories: ["Ramp"] },
      ]),
    ).rejects.toThrow("Subcategories only apply to MAINBOARD cards");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("swallows InvariantViolation so the action is a silent no-op", async () => {
    asOwner();
    mockApply.mockRejectedValueOnce(
      new InvariantViolation([
        { kind: "singleton_violation", cardName: "Sol Ring", quantity: 2 },
      ]),
    );

    await expect(
      addCardsToDeck(DECK_ID, [{ cardId: 1 }]),
    ).resolves.toBeUndefined();
  });

  it("propagates non-InvariantViolation errors", async () => {
    asOwner();
    mockApply.mockRejectedValueOnce(new Error("boom"));

    await expect(addCardsToDeck(DECK_ID, [{ cardId: 1 }])).rejects.toThrow("boom");
  });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(addCardsToDeck(DECK_ID, [{ cardId: 1 }])).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockApply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeCardFromDeck
// ---------------------------------------------------------------------------

describe("removeCardFromDeck", () => {
  it("forwards a remove op", async () => {
    asOwner();

    await removeCardFromDeck(DECK_ID, "dc-1");

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      { op: "remove", deckCardId: "dc-1" },
    ]);
  });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(removeCardFromDeck(DECK_ID, "dc-1")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockApply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateCardQuantity
// ---------------------------------------------------------------------------

describe("updateCardQuantity", () => {
  it("forwards an update op with the requested quantity", async () => {
    asOwner();

    await updateCardQuantity(DECK_ID, "dc-1", 4);

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      { op: "update", deckCardId: "dc-1", quantity: 4 },
    ]);
  });

  it("forwards quantity <= 0 unchanged (mutation module handles delete)", async () => {
    asOwner();

    await updateCardQuantity(DECK_ID, "dc-1", 0);

    expect(changesPassedToApply()).toEqual<PlannedChange[]>([
      { op: "update", deckCardId: "dc-1", quantity: 0 },
    ]);
  });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(updateCardQuantity(DECK_ID, "dc-1", 2)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockApply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// bulkUpdateDeck
// ---------------------------------------------------------------------------

describe("bulkUpdateDeck", () => {
  it("forwards the change array verbatim to applyChanges", async () => {
    asOwner();

    const changes: PlannedChange[] = [
      { op: "add", cardId: 99, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
      { op: "remove", deckCardId: "dc-1" },
      { op: "update", deckCardId: "dc-2", quantity: 4 },
    ];

    await bulkUpdateDeck(DECK_ID, changes);

    expect(mockApply).toHaveBeenCalledWith(DECK_ID, USER_ID, changes);
  });

  // Invariant hard-block is currently disabled in `applyChanges`; re-enable
  // this test alongside the gate in lib/deck/mutation/apply.ts.
  // it("propagates InvariantViolation (no longer silently allows singleton breaches)", async () => {
  //   asOwner();
  //   mockApply.mockRejectedValueOnce(
  //     new InvariantViolation([
  //       {
  //         code: "singleton_violation",
  //         message: "Sol Ring: Singleton format — 2 copies in deck",
  //       },
  //     ]),
  //   );
  //   await expect(
  //     bulkUpdateDeck(DECK_ID, [
  //       { op: "add", cardId: 7, quantity: 2, zone: Zone.MAINBOARD, categories: [] },
  //     ]),
  //   ).rejects.toBeInstanceOf(InvariantViolation);
  // });

  it("404s for non-owners", async () => {
    asOutsider();

    await expect(
      bulkUpdateDeck(DECK_ID, [
        { op: "add", cardId: 1, quantity: 1, zone: Zone.MAINBOARD, categories: [] },
      ]),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockApply).not.toHaveBeenCalled();
  });
});
