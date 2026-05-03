import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetry", () => ({ logWarn: vi.fn() }));

import type { Prisma } from "@/lib/generated/prisma/client";
import { Zone } from "@/lib/generated/prisma/enums";
import type { RevisionDelta } from "@/lib/deck/revision";
import { recordDeckRevisionTx } from "../revision";

const DECK_ID = "deck-1";
const USER_ID = "user-1";

const delta: RevisionDelta = {
  cardId: 1,
  cardName: "Lightning Bolt",
  zone: Zone.MAINBOARD,
  category: null,
  delta: 1,
};

type MockTx = {
  deckRevision: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function makeTx(overrides?: {
  findFirst?: unknown;
  update?: unknown;
  create?: unknown;
  delete?: unknown;
}): MockTx & Prisma.TransactionClient {
  const tx: MockTx = {
    deckRevision: {
      findFirst: vi.fn().mockResolvedValue(overrides?.findFirst ?? null),
      update: vi.fn().mockResolvedValue(overrides?.update ?? {}),
      create: vi.fn().mockResolvedValue(overrides?.create ?? {}),
      delete: vi.fn().mockResolvedValue(overrides?.delete ?? {}),
    },
  };
  return tx as MockTx & Prisma.TransactionClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordDeckRevisionTx", () => {
  it("does nothing when deltas is empty", async () => {
    const tx = makeTx();
    await recordDeckRevisionTx(tx, DECK_ID, USER_ID, []);
    expect(tx.deckRevision.findFirst).not.toHaveBeenCalled();
  });

  it("creates a new revision when no previous revision exists", async () => {
    const tx = makeTx({ findFirst: null });

    await recordDeckRevisionTx(tx, DECK_ID, USER_ID, [delta]);

    expect(tx.deckRevision.create).toHaveBeenCalledWith({
      data: {
        deckId: DECK_ID,
        userId: USER_ID,
        changes: [delta],
      },
    });
  });

  it("creates a new revision when outside the merge window", async () => {
    const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    const tx = makeTx({
      findFirst: {
        id: "rev-old",
        updatedAt: staleDate,
        changes: [delta],
      },
    });

    const newDelta: RevisionDelta = { ...delta, cardId: 2, cardName: "Shock" };
    await recordDeckRevisionTx(tx, DECK_ID, USER_ID, [newDelta]);

    expect(tx.deckRevision.create).toHaveBeenCalledWith({
      data: {
        deckId: DECK_ID,
        userId: USER_ID,
        changes: [newDelta],
      },
    });
    expect(tx.deckRevision.update).not.toHaveBeenCalled();
  });

  describe("within the merge window (round-trip write → read)", () => {
    it("merges incoming deltas with the stored JSON and updates the revision", async () => {
      const recentDate = new Date(Date.now() - 30 * 1000); // 30 s ago
      // Simulate what Prisma returns from the DB: a plain JSON array (unknown
      // at runtime). parseRevisionDeltas must validate and parse it safely.
      const storedChanges = [
        {
          cardId: 1,
          cardName: "Lightning Bolt",
          zone: Zone.MAINBOARD,
          category: null,
          delta: 1,
        },
      ];
      const tx = makeTx({
        findFirst: {
          id: "rev-1",
          updatedAt: recentDate,
          changes: storedChanges,
        },
      });

      const incomingDelta: RevisionDelta = { ...delta, delta: 2 };
      await recordDeckRevisionTx(tx, DECK_ID, USER_ID, [incomingDelta]);

      // mergeDeltas adds the incoming delta (2) on top of the stored delta (1)
      expect(tx.deckRevision.update).toHaveBeenCalledWith({
        where: { id: "rev-1" },
        data: {
          changes: [
            {
              cardId: 1,
              cardName: "Lightning Bolt",
              zone: Zone.MAINBOARD,
              category: null,
              delta: 3,
            },
          ],
        },
      });
      expect(tx.deckRevision.create).not.toHaveBeenCalled();
    });

    it("deletes the revision when merging results in zero net delta", async () => {
      const recentDate = new Date(Date.now() - 30 * 1000);
      const storedChanges = [
        {
          cardId: 1,
          cardName: "Lightning Bolt",
          zone: Zone.MAINBOARD,
          category: null,
          delta: 1,
        },
      ];
      const tx = makeTx({
        findFirst: {
          id: "rev-zero",
          updatedAt: recentDate,
          changes: storedChanges,
        },
      });

      // Incoming delta of -1 cancels the stored +1 → net 0 → delete
      const cancelDelta: RevisionDelta = { ...delta, delta: -1 };
      await recordDeckRevisionTx(tx, DECK_ID, USER_ID, [cancelDelta]);

      expect(tx.deckRevision.delete).toHaveBeenCalledWith({
        where: { id: "rev-zero" },
      });
      expect(tx.deckRevision.update).not.toHaveBeenCalled();
    });

    it("tolerates malformed stored JSON by treating it as empty (parseRevisionDeltas fallback)", async () => {
      const recentDate = new Date(Date.now() - 30 * 1000);
      // Simulate corrupted DB data that does not match RevisionDelta schema
      const tx = makeTx({
        findFirst: {
          id: "rev-corrupt",
          updatedAt: recentDate,
          changes: [{ bad: "data" }],
        },
      });

      await recordDeckRevisionTx(tx, DECK_ID, USER_ID, [delta]);

      // parseRevisionDeltas returns [] for invalid data; merge with [] → [delta]
      expect(tx.deckRevision.update).toHaveBeenCalledWith({
        where: { id: "rev-corrupt" },
        data: { changes: [delta] },
      });
    });
  });
});
