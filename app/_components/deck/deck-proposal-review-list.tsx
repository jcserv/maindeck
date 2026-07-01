"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  approveDeckProposal,
  rejectDeckProposal,
  type DeckProposalView,
} from "@/app/_actions/deck/collaboration";
import { groupDeltasByZone } from "@/lib/deck/group-deltas";
import type { Zone } from "@/lib/generated/prisma/enums";

interface DeckProposalReviewListProps {
  deckId: string;
  proposals: DeckProposalView[];
}

const ZONE_LABEL: Record<Zone, string> = {
  MAINBOARD: "Mainboard",
  SIDEBOARD: "Sideboard",
  CONSIDERING: "Considering",
  COMMANDER: "Commander",
  COMPANION: "Companion",
};

const STATUS_LABEL: Record<DeckProposalView["status"], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function DeckProposalReviewList({
  deckId,
  proposals,
}: DeckProposalReviewListProps) {
  const pending = proposals.filter((p) => p.status === "PENDING");
  const resolved = proposals.filter((p) => p.status !== "PENDING");

  if (proposals.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No proposals yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {pending.map((p) => (
              <ProposalCard key={p.id} deckId={deckId} proposal={p} />
            ))}
          </ul>
        )}
      </div>

      {resolved.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Resolved
          </h2>
          <ul className="flex flex-col gap-4">
            {resolved.map((p) => (
              <ProposalCard key={p.id} deckId={deckId} proposal={p} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  deckId,
  proposal,
}: {
  deckId: string;
  proposal: DeckProposalView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const grouped = groupDeltasByZone(proposal.changes);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      try {
        await approveDeckProposal(deckId, proposal.id);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not approve this proposal.",
        );
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectDeckProposal(deckId, proposal.id);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not reject this proposal.",
        );
      }
    });
  }

  return (
    <li className="rounded-md border bg-card">
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium truncate">
            {proposal.proposer.username}
          </span>
          <time
            dateTime={new Date(proposal.createdAt).toISOString()}
            className="text-xs text-muted-foreground"
          >
            {new Date(proposal.createdAt).toLocaleString()}
          </time>
        </div>
        {proposal.status === "PENDING" ? (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleReject}
            >
              <X className="size-3.5" aria-hidden />
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={handleApprove}
            >
              <Check className="size-3.5" aria-hidden />
              Approve
            </Button>
          </div>
        ) : (
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {STATUS_LABEL[proposal.status]}
          </span>
        )}
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        {proposal.message && (
          <p className="text-sm text-muted-foreground italic">
            &ldquo;{proposal.message}&rdquo;
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {grouped.map(({ zone, deltas }) => (
          <div key={zone} className="flex flex-col gap-1">
            {grouped.length > 1 && (
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {ZONE_LABEL[zone]}
              </div>
            )}
            <ul className="flex flex-col gap-0.5 text-sm">
              {deltas.map((d) => (
                <li
                  key={`${d.cardId}-${d.zone}-${d.category ?? ""}`}
                  className="flex items-center gap-2 tabular-nums"
                >
                  <span
                    className={
                      d.delta > 0
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : "text-red-600 dark:text-red-400 font-medium"
                    }
                  >
                    {d.delta > 0 ? `+${d.delta}` : d.delta}
                  </span>
                  <span>{d.cardName || `Card #${d.cardId}`}</span>
                  {d.category && (
                    <span className="text-xs text-muted-foreground">
                      ({d.category})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </li>
  );
}
