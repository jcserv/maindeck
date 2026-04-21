"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { BulkEditDialog } from "@/app/_components/bulk-edit-dialog";
import { useHeaderSearch } from "@/app/_components/header-search-context";
import { ViewModeToolbar } from "@/app/_components/view-mode-toolbar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ListRestart, Plus } from "lucide-react";
import {
  parseSortDir,
  parseSortKey,
  type GroupBy,
  type SortDir,
  type SortKey,
} from "@/lib/deck/group-sort";

type ViewMode = "text" | "stack";

interface DecklistToolbarProps {
  deckId: string;
  isOwner: boolean;
  initialBulkEditText: string;
}

const GROUP_VALUES: readonly GroupBy[] = [
  "category",
  "type",
  "color",
  "mv",
  "set",
  "rarity",
];

function parseView(raw: string | null): ViewMode {
  return raw === "stack" ? "stack" : "text";
}
function parseGroupBy(raw: string | null): GroupBy {
  return GROUP_VALUES.includes(raw as GroupBy) ? (raw as GroupBy) : "category";
}

export function DecklistToolbar({
  deckId,
  isOwner,
  initialBulkEditText,
}: DecklistToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { focus } = useHeaderSearch();

  const view = parseView(searchParams.get("view"));
  const groupBy = parseGroupBy(searchParams.get("group"));
  const sortKey = parseSortKey(searchParams.get("sort"));
  const sortDir = parseSortDir(searchParams.get("dir"));

  function handleChange(next: {
    view?: ViewMode;
    groupBy?: GroupBy;
    sortKey?: SortKey;
    sortDir?: SortDir;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.view !== undefined) params.set("view", next.view);
    if (next.groupBy !== undefined) params.set("group", next.groupBy);
    if (next.sortKey !== undefined) params.set("sort", next.sortKey);
    if (next.sortDir !== undefined) params.set("dir", next.sortDir);
    router.push(`/deck/${deckId}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <ViewModeToolbar
        view={view}
        groupBy={groupBy}
        sortKey={sortKey}
        sortDir={sortDir}
        onChange={handleChange}
      />
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="hidden sm:inline-flex items-center gap-1">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          Cycle
        </span>
        {isOwner && (
          <>
            <BulkEditDialog
              deckId={deckId}
              initialText={initialBulkEditText}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  aria-label="Bulk edit decklist"
                >
                  <ListRestart className="size-3.5" aria-hidden />
                  Bulk edit
                </Button>
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => focus()}
              className="h-7 px-2 text-xs"
              aria-label="Focus header card search"
            >
              <Plus className="size-3.5" aria-hidden />
              Add
              <Kbd className="ml-1">⌘K</Kbd>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
