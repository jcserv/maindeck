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
vi.mock("@/lib/db", () => ({
  prisma: {
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
    card: {
      findMany: vi.fn(),
    },
    deckProposal: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
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
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockProposalCreate = vi.mocked(prisma.deckProposal.create);
const mockProposalFindMany = vi.mocked(prisma.deckProposal.findMany);
const mockProposalFindUnique = vi.mocked(prisma.deckProposal.findUnique);
const mockProposalUpdate = vi.mocked(prisma.deckProposal.update);
const mockRequireSession = vi.mocked(requireSession);
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

beforeEach(() => {
  vi.clearAllMocks();
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
  const addSolRing = [
    {
      cardId: 1,
      cardName: "Sol Ring",
      zone: Zone.MAINBOARD,
      category: null,
      delta: 1,
    },
  ];

  it("creates a pending proposal for an eligible collaborator", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
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

  it("404s a submission from a viewer collaboration is disabled for", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(
      deckRow({ collaborationEnabled: false }) as never,
    );

    await expect(submitDeckProposal(DECK_ID, addSolRing)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty changes array before touching the deck", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);

    await expect(submitDeckProposal(DECK_ID, [])).rejects.toThrow();
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });

  it("rejects a delta that pairs a category with a non-mainboard zone", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);

    const badDelta = [
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.SIDEBOARD,
        category: "Ramp",
        delta: 1,
      },
    ];

    await expect(submitDeckProposal(DECK_ID, badDelta)).rejects.toThrow(
      StructuralViolation,
    );
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });

  it("rejects a proposal whose resolved deckCardId has drifted off the current snapshot", async () => {
    mockRequireSession.mockResolvedValue({ userId: PROPOSER_ID } as never);
    // The deck's current snapshot no longer has this row (raced with another edit).
    mockDeckFindUnique.mockResolvedValue(deckRow({ cards: [] }) as never);
    mockFollowFindUnique.mockResolvedValue({ followerId: OWNER_ID } as never);
    mockDeckCardFindMany.mockResolvedValue([
      {
        id: "dc-stale",
        cardId: 1,
        zone: Zone.MAINBOARD,
        category: null,
        quantity: 1,
      },
    ] as never);

    const removeDelta = [
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: Zone.MAINBOARD,
        category: null,
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
  const addSolRing = [
    {
      cardId: 1,
      cardName: "Sol Ring",
      zone: Zone.MAINBOARD,
      category: null,
      delta: 1,
    },
  ];

  it("approves a pending proposal, applies it, and attributes the resulting revision to the proposer", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalFindUnique.mockResolvedValue({
      id: "prop-1",
      deckId: DECK_ID,
      proposerId: PROPOSER_ID,
      status: "PENDING",
      changes: addSolRing,
    } as never);
    mockDeckCardFindMany.mockResolvedValue([] as never);

    await approveDeckProposal(DECK_ID, "prop-1");

    expect(mockApplyChanges).toHaveBeenCalledTimes(1);
    const [appliedDeckId, actorId] = mockApplyChanges.mock.calls[0]!;
    expect(appliedDeckId).toBe(DECK_ID);
    // Attributed to the proposer, not the approving owner.
    expect(actorId).toBe(PROPOSER_ID);
    expect(mockProposalUpdate).toHaveBeenCalledWith({
      where: { id: "prop-1" },
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
    mockProposalFindUnique.mockResolvedValue({
      id: "prop-1",
      deckId: DECK_ID,
      proposerId: PROPOSER_ID,
      status: "PENDING",
      changes: [],
    } as never);

    await rejectDeckProposal(DECK_ID, "prop-1");

    expect(mockApplyChanges).not.toHaveBeenCalled();
    expect(mockDeckCardFindMany).not.toHaveBeenCalled();
    expect(mockProposalUpdate).toHaveBeenCalledWith({
      where: { id: "prop-1" },
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
    expect(mockProposalUpdate).not.toHaveBeenCalled();
  });
});

describe("approveDeckProposal on a stale or already-resolved proposal", () => {
  it("throws when the proposal doesn't exist", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalFindUnique.mockResolvedValue(null);

    await expect(approveDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      "Proposal not found",
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });

  it("throws without applying changes or resolving the proposal, when the targeted card is no longer on the deck", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalFindUnique.mockResolvedValue({
      id: "prop-1",
      deckId: DECK_ID,
      proposerId: PROPOSER_ID,
      status: "PENDING",
      changes: [
        {
          cardId: 1,
          cardName: "Sol Ring",
          zone: Zone.MAINBOARD,
          category: null,
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
    expect(mockProposalUpdate).not.toHaveBeenCalled();
  });

  it("throws when the proposal has already been resolved", async () => {
    mockRequireSession.mockResolvedValue({ userId: OWNER_ID } as never);
    mockDeckFindUnique.mockResolvedValue(deckRow() as never);
    mockProposalFindUnique.mockResolvedValue({
      id: "prop-1",
      deckId: DECK_ID,
      proposerId: PROPOSER_ID,
      status: "APPROVED",
      changes: [],
    } as never);

    await expect(approveDeckProposal(DECK_ID, "prop-1")).rejects.toThrow(
      /already been resolved/,
    );
    expect(mockApplyChanges).not.toHaveBeenCalled();
  });
});
