"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { revertDeckRevision } from "@/app/_actions/deck/revisions";
import type { RevisionView } from "@/app/_actions/deck/revisions";
import type { RevisionDelta } from "@/lib/deck/revision";
import type { Zone } from "@/lib/generated/prisma/enums";

interface DeckHistoryListProps {
  deckId: string;
  revisions: RevisionView[];
  isOwner: boolean;
}

const ZONE_LABEL: Record<Zone, string> = {
  MAINBOARD: "Mainboard",
  SIDEBOARD: "Sideboard",
  CONSIDERING: "Considering",
  COMMANDER: "Commander",
};

export function DeckHistoryList({
  deckId,
  revisions,
  isOwner,
}: DeckHistoryListProps) {
  if (revisions.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No edits yet
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {revisions.map((r) => (
        <RevisionCard
          key={r.id}
          deckId={deckId}
          revision={r}
          isOwner={isOwner}
        />
      ))}
    </ul>
  );
}

function RevisionCard({
  deckId,
  revision,
  isOwner,
}: {
  deckId: string;
  revision: RevisionView;
  isOwner: boolean;
}) {
  const updatedAt = useMemo(
    () => new Date(revision.updatedAt),
    [revision.updatedAt],
  );
  const grouped = useMemo(() => groupByZone(revision.changes), [revision.changes]);

  return (
    <li className="rounded-md border bg-card">
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b">
        <div className="flex flex-col gap-0.5">
          <time
            dateTime={updatedAt.toISOString()}
            title={updatedAt.toLocaleString()}
            className="text-sm font-medium"
          >
            {relativeTime(updatedAt)}
          </time>
          <span className="text-xs text-muted-foreground">
            {revision.changes.length} change
            {revision.changes.length !== 1 ? "s" : ""}
          </span>
        </div>
        {isOwner && (
          <RevertButton deckId={deckId} revisionId={revision.id} />
        )}
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
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
                  key={`${d.cardId}|${d.zone}|${d.category ?? ""}`}
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

function RevertButton({
  deckId,
  revisionId,
}: {
  deckId: string;
  revisionId: string;
}) {
  const router = useRouter();

  async function handleRevert() {
    await revertDeckRevision(deckId, revisionId);
    router.refresh();
  }

  return (
    <ConfirmDialog
      title="Revert this revision?"
      description="The inverse of this change will be applied and recorded as a new revision."
      confirmLabel="Revert"
      pendingLabel="Reverting…"
      variant="outline"
      trigger={
        <Button type="button" variant="outline" size="sm">
          <Undo2 className="size-3.5" aria-hidden />
          Revert
        </Button>
      }
      onConfirm={handleRevert}
    />
  );
}

function groupByZone(
  deltas: RevisionDelta[],
): Array<{ zone: Zone; deltas: RevisionDelta[] }> {
  const byZone = new Map<Zone, RevisionDelta[]>();
  for (const d of deltas) {
    const list = byZone.get(d.zone) ?? [];
    list.push(d);
    byZone.set(d.zone, list);
  }
  const zones: Zone[] = ["COMMANDER", "MAINBOARD", "SIDEBOARD", "CONSIDERING"];
  return zones
    .filter((z) => byZone.has(z))
    .map((zone) => ({
      zone,
      deltas: (byZone.get(zone) ?? [])
        .slice()
        .sort((a, b) => {
          const signDiff = Math.sign(b.delta) - Math.sign(a.delta);
          if (signDiff !== 0) return signDiff;
          return a.cardName.localeCompare(b.cardName);
        }),
    }));
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "Just now";
  if (abs < hour) {
    const m = Math.round(abs / minute);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (abs < day) {
    const h = Math.round(abs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.round(abs / day);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
