"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BulkEditDialog } from "@/app/_components/bulk-edit-dialog";
import { useHeaderSearch } from "@/app/_components/header-search-context";
import { ViewModeToolbar } from "@/app/_components/view-mode-toolbar";
import { registerDeckAction } from "@/app/_components/hotkeys/deck-actions-bus";
import { autogenerateCategories } from "@/app/_actions/deck/categories";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { ChevronDown, ListRestart, Plus, Wand2 } from "lucide-react";
import {
  parseSortDir,
  parseSortKey,
  type GroupBy,
  type SortDir,
  type SortKey,
} from "@/lib/deck/group-sort";
import type { Format } from "@/lib/generated/prisma/enums";

type ViewMode = "text" | "stack";

interface DecklistToolbarProps {
  deckId: string;
  deckFormat: Format;
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
  deckFormat,
  isOwner,
  initialBulkEditText,
}: DecklistToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { focus } = useHeaderSearch();
  const [isPending, startTransition] = useTransition();

  function handleAutogenerate(preset: "byType" | "commanderTemplate") {
    startTransition(async () => {
      await autogenerateCategories(deckId, preset);
    });
  }

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

  useEffect(() => {
    return registerDeckAction("toggle-view", () => {
      handleChange({ view: view === "text" ? "stack" : "text" });
    });
    // handleChange closes over searchParams/deckId/router which all change with
    // route state — re-registering on each render keeps the closure fresh.
  });

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
        <span className="hidden sm:inline-flex items-center gap-1">
          <Kbd>?</Kbd>
          Shortcuts
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
            {groupBy === "category" && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={isPending}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Auto-categorize deck"
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  Auto-categorize
                  <ChevronDown className="size-3 ml-0.5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Choose preset</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleAutogenerate("byType")}>
                      By type
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={deckFormat !== "COMMANDER"}
                      onClick={() => handleAutogenerate("commanderTemplate")}
                    >
                      Command zone template
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
