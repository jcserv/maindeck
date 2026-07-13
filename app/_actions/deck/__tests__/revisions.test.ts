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
    deckCategory: {
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
const mockDeckCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockRequireViewable = vi.mocked(requireDeckViewable);
const mockApplyChanges = vi.mocked(applyChanges);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireViewable.mockResolvedValue({ isOwner: true });
  mockDeckCategoryFindMany.mockResolvedValue([] as never);
});

describe("listDeckRevisions", () => {
  it("returns parsed revisions for a viewable deck (legacy category payloads normalized)", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const updatedAt = new Date("2026-01-02T00:00:00Z");
    mockFindMany.mockResolvedValue([
      {
        id: "rev-1",
        createdAt,
        updatedAt,
        changes: [
          // Legacy single-category payload as stored pre-migration.
          {
            cardId: 1,
            cardName: "Sol Ring",
            zone: Zone.MAINBOARD,
            category: null,
            delta: 1,
          },
          // Modern multi-category payload.
          {
            cardId: 2,
            cardName: "Arcane Signet",
            zone: Zone.MAINBOARD,
            categories: ["ramp"],
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
            categories: [],
            delta: 1,
          },
          {
            cardId: 2,
            cardName: "Arcane Signet",
            zone: Zone.MAINBOARD,
            categories: ["ramp"],
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

  it("passes the deck's known category names through to deltasToBulkChanges", async () => {
    mockFindUnique.mockResolvedValue({
      deckId: "deck-1",
      changes: [
        {
          cardId: 7,
          cardName: "Sol Ring",
          zone: Zone.MAINBOARD,
          categories: ["ramp"],
          delta: 2,
        },
      ],
    } as never);
    mockDeckCardFindMany.mockResolvedValue([
      {
        id: "dc-1",
        cardId: 7,
        zone: Zone.MAINBOARD,
        quantity: 2,
      },
    ] as never);
    mockDeckCategoryFindMany.mockResolvedValue([
      { name: "ramp" },
    ] as never);

    await revertDeckRevision("deck-1", "rev-1");

    expect(mockApplyChanges).toHaveBeenCalledTimes(1);
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

  describe("partial revert (deltaKeys filter)", () => {
    const twoDeltaRevision = {
      deckId: "deck-1",
      changes: [
        {
          cardId: 7,
          cardName: "Sol Ring",
          zone: Zone.MAINBOARD,
          category: null,
          delta: 2,
        },
        {
          cardId: 8,
          cardName: "Arcane Signet",
          zone: Zone.MAINBOARD,
          category: null,
          delta: 1,
        },
      ],
    };
    const existingRows = [
      { id: "dc-7", cardId: 7, zone: Zone.MAINBOARD, category: null, quantity: 2 },
      { id: "dc-8", cardId: 8, zone: Zone.MAINBOARD, category: null, quantity: 1 },
    ];

    it("filters deltas to the matching key set", async () => {
      mockFindUnique.mockResolvedValue(twoDeltaRevision as never);
      mockDeckCardFindMany.mockResolvedValue(existingRows as never);

      await revertDeckRevision("deck-1", "rev-1", [
        `7|${Zone.MAINBOARD}`,
      ]);

      expect(mockApplyChanges).toHaveBeenCalledTimes(1);
      const [, , changes] = mockApplyChanges.mock.calls[0]!;
      // Only the dc-7 row should be touched (Sol Ring inverse: -2 → remove).
      expect(changes).toEqual([{ op: "remove", deckCardId: "dc-7" }]);
    });

    it("returns early when filter yields no deltas (empty array)", async () => {
      mockFindUnique.mockResolvedValue(twoDeltaRevision as never);
      mockDeckCardFindMany.mockResolvedValue(existingRows as never);

      await revertDeckRevision("deck-1", "rev-1", []);
      expect(mockApplyChanges).not.toHaveBeenCalled();
    });

    it("silently drops unknown keys", async () => {
      mockFindUnique.mockResolvedValue(twoDeltaRevision as never);
      mockDeckCardFindMany.mockResolvedValue(existingRows as never);

      await revertDeckRevision("deck-1", "rev-1", ["999|MAINBOARD"]);
      expect(mockApplyChanges).not.toHaveBeenCalled();
    });

    it("partial revert with multiple matching keys applies inverses for all", async () => {
      mockFindUnique.mockResolvedValue(twoDeltaRevision as never);
      mockDeckCardFindMany.mockResolvedValue(existingRows as never);

      await revertDeckRevision("deck-1", "rev-1", [
        `7|${Zone.MAINBOARD}`,
        `8|${Zone.MAINBOARD}`,
      ]);

      expect(mockApplyChanges).toHaveBeenCalledTimes(1);
      const [, , changes] = mockApplyChanges.mock.calls[0]!;
      expect(changes).toEqual(
        expect.arrayContaining([
          { op: "remove", deckCardId: "dc-7" },
          { op: "remove", deckCardId: "dc-8" },
        ]),
      );
      expect(changes).toHaveLength(2);
    });

    it("treats non-array deltaKeys as no-op at runtime boundary", async () => {
      mockFindUnique.mockResolvedValue(twoDeltaRevision as never);
      mockDeckCardFindMany.mockResolvedValue(existingRows as never);

      // Simulate a malformed client payload getting past TS at the action edge.
      await revertDeckRevision(
        "deck-1",
        "rev-1",
        "not-an-array" as unknown as string[],
      );
      expect(mockApplyChanges).not.toHaveBeenCalled();
    });

    it("returns early when bulk-change translation yields no ops (zero-delta entry)", async () => {
      mockFindUnique.mockResolvedValue({
        deckId: "deck-1",
        changes: [
          {
            cardId: 999,
            cardName: "No-op",
            zone: Zone.MAINBOARD,
            category: null,
            delta: 0,
          },
        ],
      } as never);
      mockDeckCardFindMany.mockResolvedValue([] as never);

      // Zero delta survives the filter but deltasToBulkChanges skips it → empty.
      await revertDeckRevision("deck-1", "rev-1", [`999|${Zone.MAINBOARD}`]);
      expect(mockApplyChanges).not.toHaveBeenCalled();
    });

    it("treats undefined deltaKeys as full revert (back-compat)", async () => {
      mockFindUnique.mockResolvedValue(twoDeltaRevision as never);
      mockDeckCardFindMany.mockResolvedValue(existingRows as never);

      await revertDeckRevision("deck-1", "rev-1", undefined);

      expect(mockApplyChanges).toHaveBeenCalledTimes(1);
      const [, , changes] = mockApplyChanges.mock.calls[0]!;
      expect(changes).toHaveLength(2);
    });
  });
});
