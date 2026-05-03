import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/enums";

vi.mock("@/lib/db", () => ({
  prisma: {
    deckRevision: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    deckCard: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth/deck-access", () => ({
  requireDeckViewable: vi.fn(),
  requireDeckOwner: vi.fn(),
}));
vi.mock("@/lib/deck/mutation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deck/mutation")>(
    "@/lib/deck/mutation",
  );
  return {
    ...actual,
    applyChanges: vi.fn(),
    runOwnerDeckMutation: <Args extends unknown[], R>(
      _source: string,
      _tags: string,
      body: (
        ctx: { deckId: string; userId: string },
        ...args: Args
      ) => Promise<R>,
    ) => async (deckId: string, ...args: Args) =>
      body({ deckId, userId: "user-1" }, ...args),
  };
});

import { prisma } from "@/lib/db";
import { requireDeckViewable } from "@/lib/auth/deck-access";
import { applyChanges } from "@/lib/deck/mutation";
import { listDeckRevisions, revertDeckRevision } from "../revisions";

const mockFindMany = vi.mocked(prisma.deckRevision.findMany);
const mockFindUnique = vi.mocked(prisma.deckRevision.findUnique);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockRequireViewable = vi.mocked(requireDeckViewable);
const mockApplyChanges = vi.mocked(applyChanges);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireViewable.mockResolvedValue({ isOwner: true });
});

describe("listDeckRevisions", () => {
  it("returns parsed revisions for a viewable deck", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const updatedAt = new Date("2026-01-02T00:00:00Z");
    mockFindMany.mockResolvedValue([
      {
        id: "rev-1",
        createdAt,
        updatedAt,
        changes: [
          {
            cardId: 1,
            cardName: "Sol Ring",
            zone: Zone.MAINBOARD,
            category: null,
            delta: 1,
          },
        ],
      },
    ] as never);

    const out = await listDeckRevisions("deck-1");
    expect(mockRequireViewable).toHaveBeenCalledWith("deck-1");
    expect(out).toEqual([
      {
        id: "rev-1",
        createdAt,
        updatedAt,
        changes: [
          {
            cardId: 1,
            cardName: "Sol Ring",
            zone: Zone.MAINBOARD,
            category: null,
            delta: 1,
          },
        ],
      },
    ]);
  });

  it("returns an empty changes array when revision payload is malformed", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "rev-bad",
        createdAt: new Date(),
        updatedAt: new Date(),
        changes: { not: "an array" },
      },
    ] as never);
    const out = await listDeckRevisions("deck-1");
    expect(out[0]!.changes).toEqual([]);
  });
});

describe("revertDeckRevision", () => {
  it("inverts the deltas and applies them via applyChanges", async () => {
    mockFindUnique.mockResolvedValue({
      deckId: "deck-1",
      changes: [
        {
          cardId: 7,
          cardName: "Sol Ring",
          zone: Zone.MAINBOARD,
          category: null,
          delta: 2,
        },
      ],
    } as never);
    mockDeckCardFindMany.mockResolvedValue([
      {
        id: "dc-1",
        cardId: 7,
        zone: Zone.MAINBOARD,
        category: null,
        quantity: 2,
      },
    ] as never);

    await revertDeckRevision("deck-1", "rev-1");

    expect(mockApplyChanges).toHaveBeenCalledTimes(1);
    const [deckId, userId, changes] = mockApplyChanges.mock.calls[0]!;
    expect(deckId).toBe("deck-1");
    expect(userId).toBe("user-1");
    // Inverting +2 then turning into bulk changes should remove copies.
    expect(changes.length).toBeGreaterThan(0);
  });

  it("throws when the revision doesn't belong to the deck", async () => {
    mockFindUnique.mockResolvedValue({
      deckId: "other-deck",
      changes: [],
    } as never);
    await expect(revertDeckRevision("deck-1", "rev-x")).rejects.toThrow(
      /Not found or unauthorized/,
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });

  it("throws when the revision doesn't exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(revertDeckRevision("deck-1", "rev-x")).rejects.toThrow(
      /Not found or unauthorized/,
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });

  it("returns early without applyChanges when inverted deltas produce no changes", async () => {
    mockFindUnique.mockResolvedValue({
      deckId: "deck-1",
      // Empty changes array → invertDeltas → empty bulk changes → early return.
      changes: [],
    } as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);

    await revertDeckRevision("deck-1", "rev-1");
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });
});
