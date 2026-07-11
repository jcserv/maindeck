"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { revertDeckRevision } from "@/app/_actions/deck/revisions";
import type { RevisionView } from "@/app/_actions/deck/revisions";
import { RevisionDiff } from "@/app/_components/deck/revision-diff";

interface DeckHistoryListProps {
  deckId: string;
  revisions: RevisionView[];
  isOwner: boolean;
  highlightId?: string | undefined;
}

export function DeckHistoryList({
  deckId,
  revisions,
  isOwner,
  highlightId,
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
          isHighlighted={r.id === highlightId}
        />
      ))}
    </ul>
  );
}

function RevisionCard({
  deckId,
  revision,
  isOwner,
  isHighlighted,
}: {
  deckId: string;
  revision: RevisionView;
  isOwner: boolean;
  isHighlighted: boolean;
}) {
  const cardRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!isHighlighted) return;
    cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [isHighlighted]);

  const updatedAt = useMemo(
    () => new Date(revision.updatedAt),
    [revision.updatedAt],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  return (
    <li
      ref={cardRef}
      className={
        isHighlighted
          ? "rounded-md border bg-card ring-2 ring-primary border-primary"
          : "rounded-md border bg-card"
      }
    >
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b">
        <div className="flex flex-col gap-0.5">
          <time
            dateTime={updatedAt.toISOString()}
            title={updatedAt.toLocaleString()}
            suppressHydrationWarning
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
          <RevertButton
            deckId={deckId}
            revisionId={revision.id}
            selected={selected}
            onReverted={clearSelection}
          />
        )}
      </header>

      <div className="px-4 py-3">
        <RevisionDiff
          deltas={revision.changes}
          renderRowStart={
            isOwner
              ? (d, key) => (
                  <Checkbox
                    aria-label={`Select ${d.cardName || `card ${d.cardId}`} change for partial revert`}
                    checked={selected.has(key)}
                    onCheckedChange={(checked) => toggle(key, checked)}
                  />
                )
              : undefined
          }
        />
      </div>
    </li>
  );
}

function RevertButton({
  deckId,
  revisionId,
  selected,
  onReverted,
}: {
  deckId: string;
  revisionId: string;
  selected: Set<string>;
  onReverted: () => void;
}) {
  const { label, title, description } = selected.size > 0
    ? {
        label: `Revert ${selected.size} selected`,
        title: `Revert ${selected.size} selected change${selected.size === 1 ? "" : "s"}?`,
        description:
          "The inverse of the selected change(s) will be applied and recorded as a new revision.",
      }
    : {
        label: "Revert all",
        title: "Revert this revision?",
        description:
          "The inverse of this change will be applied and recorded as a new revision.",
      };

  async function handleRevert() {
    const keys = selected.size > 0 ? [...selected] : undefined;
    await revertDeckRevision(deckId, revisionId, keys);
    onReverted();
  }

  return (
    <ConfirmDialog
      title={title}
      description={description}
      confirmLabel="Revert"
      pendingLabel="Reverting…"
      variant="outline"
      trigger={
        <Button type="button" variant="outline" size="sm">
          <Undo2 className="size-3.5" aria-hidden />
          {label}
        </Button>
      }
      onConfirm={handleRevert}
    />
  );
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
