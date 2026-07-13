import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/enums";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
  getSession: vi.fn(),
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
vi.mock("@/lib/db", () => {
  // Declared as a local so `$transaction` can close over the finished
  // object and hand callers the same mock as `tx` — fine for asserting
  // call shape; it doesn't exercise real transaction semantics.
  const prismaMock = {
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prismaMock)),
    $executeRaw: vi.fn(),
    deck: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    follow: {
      findUnique: vi.fn(),
    },
    deckCard: {
      findMany: vi.fn(),
    },
    deckCategory: {
      findMany: vi.fn(),
    },
    card: {
      findMany: vi.fn(),
    },
    deckProposal: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  };
  return { prisma: prismaMock };
});

import { prisma } from "@/lib/db";
import { getSession, requireSession } from "@/lib/auth/session";
import { applyChanges } from "@/lib/deck/mutation";
import { StructuralViolation } from "@/lib/deck/mutation/errors";
import {
  approveDeckProposal,
  listDeckProposals,
  rejectDeckProposal,
  submitDeckProposal,
  toggleDeckCollaboration,
} from "../collaboration";

const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockDeckUpdate = vi.mocked(prisma.deck.update);
const mockFollowFindUnique = vi.mocked(prisma.follow.findUnique);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockDeckCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockProposalCreate = vi.mocked(prisma.deckProposal.create);
const mockProposalFindMany = vi.mocked(prisma.deckProposal.findMany);
const mockProposalUpdateMany = vi.mocked(prisma.deckProposal.updateMany);
const mockProposalFindUniqueOrThrow = vi.mocked(
  prisma.deckProposal.findUniqueOrThrow,
);
const mockExecuteRaw = vi.mocked(prisma.$executeRaw);
const mockRequireSession = vi.mocked(requireSession);
const mockGetSession = vi.mocked(getSession);
const mockApplyChanges = vi.mocked(applyChanges);

const OWNER_ID = "owner-1";
const PROPOSER_ID = "proposer-1";
const DECK_ID = "deck-1";

// Superset fixture satisfying both requireDeckOwner/requireDeckCollaborator's
// select and loadSnapshotForDeck's select — mocks ignore `select`, so one
// object can stand in for every prisma.deck.findUnique call in a test.
function deckRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: DECK_ID,
    userId: OWNER_ID,
    collaborationEnabled: true,
    format: "COMMANDER",
    cards: [],
    categories: [],
    ...overrides,
  };
}

const addSolRing = [
  {
    cardId: 1,
    cardName: "Sol Ring",
    zone: Zone.MAINBOARD,
    categories: [] as string[],
    delta: 1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockDeckCategoryFindMany.mockResolvedValue([] as never);
  mockCardFindMany.mockResolvedValue([
    {
      id: 1,
      name: "Sol Ring",
      typeLine: "Artifact",
      colorIdentity: [],
      legalities: {},
    },
  ] as never);
});

describe("toggleDeckCollaboration", () => {
  it("updates collaborationEnabled when the caller owns the deck", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);

    await toggleDeckCollaboration(DECK_ID, true);

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      data: { collaborationEnabled: true },
    });
  });

  it("404s for a non-owner", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);

    await expect(toggleDeckCollaboration(DECK_ID, true)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });
});

describe("submitDeckProposal", () => {
  it("creates a pending proposal for an eligible collaborator", async () => {
    mockGetSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);
    mockProposalCreate.mockResolvedValue({ id: "prop-1" } as never);

    const id = await submitDeckProposal(DECK_ID, addSolRing, "please add this");

    expect(id).toBe("prop-1");
    expect(mockProposalCreate).toHaveBeenCalledWith({
      data: {
        deckId: DECK_ID,
        proposerId: PROPOSER_ID,
        status: "PENDING",
        changes: addSolRing,
        message: "please add this",
      },
      select: { id: true },
    });
  });

  it("stores a null message when none is given, or it is blank", async () => {
    mockGetSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);
    mockProposalCreate.mockResolvedValue({ id: "prop-1" } as never);

    await submitDeckProposal(DECK_ID, addSolRing, "   ");

    expect(mockProposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message: null }),
      }),
    );
  });

  it("404s a submission from a viewer collaboration is disabled for", async () => {
    mockGetSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(
      deckRow({ collaborationEnabled: false }) as never,
    );

    await expect(submitDeckProposal(DECK_ID, addSolRing)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty changes array before touching the deck", async () => {
    mockGetSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);

    await expect(submitDeckProposal(DECK_ID, [])).rejects.toThrow();
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });

  it("rejects a delta that pairs a category with a non-mainboard zone", async () => {
    mockGetSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(
      deckRow({ categories: [{ name: "ramp" }] }) as never,
    );
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);
    // "ramp" is a known category, so it survives the known-category filter
    // and the structural zone check is what rejects it.
    mockDeckCategoryFindMany.mockResolvedValue([{ name: "ramp" }] as never);

    const badDelta = [
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.SIDEBOARD,
        categories: ["ramp"],
        delta: 1,
      },
    ];

    await expect(submitDeckProposal(DECK_ID, badDelta)).rejects.toThrow(
      StructuralViolation,
    );
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });

  it("rejects a proposal whose resolved deckCardId has drifted off the current snapshot", async () => {
    mockGetSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    // The deck's current snapshot no longer has this row (raced with another edit).
    mockDeckFindUnique.mockResolvedValue(deckRow({ cards: [] }) as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);
    mockDeckCardFindMany.mockResolvedValue([
      {
        id: "dc-stale",
        cardId: 1,
        zone: Zone.MAINBOARD,
        quantity: 1,
      },
    ] as never);

    const removeDelta = [
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        categories: [] as string[],
        delta: -1,
      },
    ];

    await expect(submitDeckProposal(DECK_ID, removeDelta)).rejects.toThrow(
      "Proposal references a card that is no longer on the deck.",
    );
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });
});

describe("listDeckProposals", () => {
  it("returns proposals for the deck owner", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalFindMany.mockResolvedValue([
      {
        id: "prop-1",
        status: "PENDING",
        changes: [],
        message: null,
        createdAt: new Date(),
        resolvedAt: null,
        proposer: { id: PROPOSER_ID, username: "proposer", image: null },
      },
    ] as never);

    const proposals = await listDeckProposals(DECK_ID);

    expect(proposals).toHaveLength(1);
    expect(mockProposalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deckId: DECK_ID } }),
    );
  });

  it("404s for a non-owner", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);

    await expect(listDeckProposals(DECK_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockProposalFindMany).not.toHaveBeenCalled();
  });
});

describe("submit → approve happy path", () => {
  it("approves a pending proposal, applies it, and attributes the resulting revision to the proposer", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockProposalFindUniqueOrThrow.mockResolvedValue({
      proposerId: PROPOSER_ID,
      changes: addSolRing,
    } as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);

    await approveDeckProposal(DECK_ID, "prop-1");

    expect(mockApplyChanges).toHaveBeenCalledTimes(1);
    const [appliedDeckId, actorId, , opts] = mockApplyChanges.mock.calls[0]!;
    expect(appliedDeckId).toBe(DECK_ID);
    // Attributed to the proposer, not the approving owner.
    expect(actorId).toBe(PROPOSER_ID);
    // applyChanges must run inside the same transaction as the CAS flip.
    expect(opts).toEqual(
      expect.objectContaining({ tx: expect.anything() }),
    );
    expect(mockProposalUpdateMany).toHaveBeenCalledWith({
      where: { id: "prop-1", deckId: DECK_ID, status: "PENDING" },
      data: expect.objectContaining({
        status: "APPROVED",
        resolvedById: OWNER_ID,
      }),
    });
  });

  it("404s when a non-owner tries to approve", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);

    await expect(approveDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });
});

describe("submit → reject", () => {
  it("marks a pending proposal rejected and never touches the deck", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalUpdateMany.mockResolvedValue({ count: 1 } as never);

    await rejectDeckProposal(DECK_ID, "prop-1");

    expect(mockApplyChanges).not.toHaveBeenCalled();
    expect(mockDeckCardFindMany).not.toHaveBeenCalled();
    expect(mockProposalUpdateMany).toHaveBeenCalledWith({
      where: { id: "prop-1", deckId: DECK_ID, status: "PENDING" },
      data: expect.objectContaining({
        status: "REJECTED",
        resolvedById: OWNER_ID,
      }),
    });
  });

  it("404s when a non-owner tries to reject", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);

    await expect(rejectDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockProposalUpdateMany).not.toHaveBeenCalled();
  });
});

describe("approveDeckProposal on a stale or already-resolved proposal", () => {
  it("throws (the collapsed 'already resolved' message) when the proposal doesn't exist", async () => {
    // The CAS `updateMany` matches on id+deckId+status=PENDING, so a
    // missing row and an already-resolved row are indistinguishable from
    // its `count`; both now surface as the single "already resolved"
    // message instead of the old two-message split. This is intentional,
    // not a regression — see plan notes.
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(approveDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      /already been resolved/,
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });

  it("throws without applying changes, when the targeted card is no longer on the deck", async () => {
    // In real Postgres, throwing here rolls back the entire transaction —
    // including the CAS flip above — leaving the proposal cleanly PENDING
    // rather than stuck "approved but not applied". The mock can't exercise
    // that rollback; it only proves `applyChanges` is never reached.
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockProposalFindUniqueOrThrow.mockResolvedValue({
      proposerId: PROPOSER_ID,
      changes: [
        {
          cardId: 1,
          cardName: "Sol Ring",
          zone: Zone.MAINBOARD,
          categories: [],
          delta: -1,
        },
      ],
    } as never);
    // Deck no longer has this card — the proposal has gone stale.
    mockDeckCardFindMany.mockResolvedValue([] as never);

    await expect(approveDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      /no longer on the deck/,
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });

  it("throws when the proposal has already been resolved", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(approveDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      /already been resolved/,
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });
});

describe("approveDeckProposal — CAS guard against double-apply", () => {
  it("the second of two concurrent approvals is rejected by the atomic status flip, and applyChanges runs only once", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);
    mockProposalUpdateMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);
    mockProposalFindUniqueOrThrow.mockResolvedValue({
      proposerId: PROPOSER_ID,
      changes: addSolRing,
    } as never);

    await approveDeckProposal(DECK_ID, "prop-1");
    await expect(approveDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      /already been resolved/,
    );

    expect(mockProposalUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockApplyChanges).toHaveBeenCalledTimes(1);
  });

  it("issues the per-deck advisory lock before the atomic status flip", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);
    mockProposalUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockProposalFindUniqueOrThrow.mockResolvedValue({
      proposerId: PROPOSER_ID,
      changes: addSolRing,
    } as never);

    await approveDeckProposal(DECK_ID, "prop-1");

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockProposalUpdateMany.mock.invocationCallOrder[0]!,
    );
  });
});

describe("rejectDeckProposal — CAS guard against double-resolve", () => {
  it("the second of two concurrent rejections is rejected by the atomic status flip", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalUpdateMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);

    await rejectDeckProposal(DECK_ID, "prop-1");
    await expect(rejectDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      /already been resolved/,
    );

    expect(mockProposalUpdateMany).toHaveBeenCalledTimes(2);
  });
});
