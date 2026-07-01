"use server";

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireDeckOwner, requireDeckCollaborator } from "@/lib/auth/deck-access";
import { withActionLogging } from "@/lib/telemetry";
import {
  applyChanges,
  loadSnapshotForDeck,
  planMutation,
  type ExistingDeckCard,
  type PlannedChange,
} from "@/lib/deck/mutation";
import { StructuralViolation } from "@/lib/deck/mutation/errors";
import {
  deltaKey,
  deltasToBulkChanges,
  revisionDeltaSchema,
  type RevisionDelta,
} from "@/lib/deck/revision";
import { ProposalStatus } from "@/lib/generated/prisma/enums";
import {
  deckProposalsTag,
  deckTag,
  invalidateTags,
} from "@/lib/deck/cache-tags";

const proposalChangesSchema = z.array(revisionDeltaSchema).min(1);

export const toggleDeckCollaboration = withActionLogging(
  "deck.toggleCollaboration",
  async (deckId: string, enabled: boolean): Promise<void> => {
    await requireDeckOwner(deckId);

    await prisma.deck.update({
      where: { id: deckId },
      data: { collaborationEnabled: enabled },
    });

    invalidateTags([deckTag(deckId)]);
  },
);

/**
 * Builds the write plan for a set of revision deltas against the deck's
 * current state. Shared by submit (dry run, nothing committed) and approve
 * (the real application), so both see the exact same "is this still valid"
 * answer relative to whatever the deck looks like right now.
 */
async function planProposalChanges(
  deckId: string,
  deltas: readonly RevisionDelta[],
  tx?: Prisma.TransactionClient,
): Promise<PlannedChange[]> {
  const client = tx ?? prisma;
  const rows = await client.deckCard.findMany({
    where: { deckId },
    select: {
      id: true,
      cardId: true,
      zone: true,
      category: true,
      quantity: true,
    },
  });

  const existing: ExistingDeckCard[] = rows.map((r) => ({
    deckCardId: r.id,
    cardId: r.cardId,
    zone: r.zone,
    category: r.category,
    quantity: r.quantity,
  }));

  const existingByKey = new Map(existing.map((e) => [deltaKey(e), e]));
  for (const d of deltas) {
    if (d.delta < 0 && !existingByKey.has(deltaKey(d))) {
      throw new Error(
        `Proposal is stale — "${d.cardName}" is no longer on the deck.`,
      );
    }
  }

  return deltasToBulkChanges(deltas, existing);
}

export const submitDeckProposal = withActionLogging(
  "deck.submitProposal",
  async (
    deckId: string,
    changes: RevisionDelta[],
    message?: string,
  ): Promise<string> => {
    const { userId } = await requireDeckCollaborator(deckId);
    const deltas = proposalChangesSchema.parse(changes);

    const plannedChanges = await planProposalChanges(deckId, deltas);
    const before = await loadSnapshotForDeck(deckId, plannedChanges);
    const { structural, missingDeckCardId } = planMutation(
      before,
      plannedChanges,
    );
    if (structural.length > 0) {
      throw new StructuralViolation(structural);
    }
    if (missingDeckCardId !== null) {
      throw new Error("Proposal references a card that is no longer on the deck.");
    }

    const proposal = await prisma.deckProposal.create({
      data: {
        deckId,
        proposerId: userId,
        status: ProposalStatus.PENDING,
        changes: deltas,
        message: message?.trim() || null,
      },
      select: { id: true },
    });

    invalidateTags([deckProposalsTag(deckId)]);
    return proposal.id;
  },
);

export type DeckProposalView = {
  id: string;
  status: ProposalStatus;
  changes: RevisionDelta[];
  message: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  proposer: { id: string; username: string; image: string | null };
};

export const listDeckProposals = withActionLogging(
  "deck.listProposals",
  async (deckId: string): Promise<DeckProposalView[]> => {
    await requireDeckOwner(deckId);

    const rows = await prisma.deckProposal.findMany({
      where: { deckId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        changes: true,
        message: true,
        createdAt: true,
        resolvedAt: true,
        proposer: { select: { id: true, username: true, image: true } },
      },
    });

    // PENDING sorts first: enum declaration order (PENDING, APPROVED,
    // REJECTED) already matches `status: "asc"` on the Postgres enum type.
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      changes: revisionDeltaSchema.array().parse(r.changes),
      message: r.message,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      proposer: r.proposer,
    }));
  },
);

export const approveDeckProposal = withActionLogging(
  "deck.approveProposal",
  async (deckId: string, proposalId: string): Promise<void> => {
    const { userId: ownerId } = await requireDeckOwner(deckId);

    await prisma.$transaction(async (tx) => {
      // Serializes all approvals for this deck so two different PENDING
      // proposals can't both plan against "no existing row" for the same
      // new card and each emit a duplicate `create`. Auto-released on
      // commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${deckId}))`;

      // Atomic compare-and-swap: only one concurrent caller can flip a
      // given proposal off PENDING. The `count === 0` branch collapses
      // "not found" and "already resolved" into one message — safe because
      // production error messages are redacted by Next.js regardless.
      const { count } = await tx.deckProposal.updateMany({
        where: { id: proposalId, deckId, status: ProposalStatus.PENDING },
        data: {
          status: ProposalStatus.APPROVED,
          resolvedById: ownerId,
          resolvedAt: new Date(),
        },
      });
      if (count === 0) {
        throw new Error("Proposal has already been resolved");
      }

      const proposal = await tx.deckProposal.findUniqueOrThrow({
        where: { id: proposalId },
        select: { proposerId: true, changes: true },
      });
      const deltas = revisionDeltaSchema.array().parse(proposal.changes);

      // Re-validated against current deck state (may have drifted since
      // submission); a stale proposal throws here, rolling back the CAS
      // flip above too, so the proposal is left cleanly PENDING rather
      // than stuck "approved but not applied".
      const plannedChanges = await planProposalChanges(deckId, deltas, tx);

      // Attributed to the proposer, not the owner, so the resulting
      // DeckRevision credits the contributor who made the change.
      await applyChanges(deckId, proposal.proposerId, plannedChanges, { tx });
    });

    invalidateTags([deckProposalsTag(deckId)]);
  },
);

export const rejectDeckProposal = withActionLogging(
  "deck.rejectProposal",
  async (deckId: string, proposalId: string): Promise<void> => {
    const { userId: ownerId } = await requireDeckOwner(deckId);

    await prisma.$transaction(async (tx) => {
      // Same CAS guard as approve; no advisory lock needed since reject
      // never touches `DeckCard`, so there's no write to serialize against.
      const { count } = await tx.deckProposal.updateMany({
        where: { id: proposalId, deckId, status: ProposalStatus.PENDING },
        data: {
          status: ProposalStatus.REJECTED,
          resolvedById: ownerId,
          resolvedAt: new Date(),
        },
      });
      if (count === 0) {
        throw new Error("Proposal has already been resolved");
      }
    });

    invalidateTags([deckProposalsTag(deckId)]);
  },
);
