"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BulkEditDialog } from "@/app/_components/builder/bulk-edit-dialog";
import { AddLandsDialog } from "@/app/_components/builder/add-lands-dialog";
import { ViewModeToolbar } from "@/app/_components/builder/view-mode-toolbar";
import { registerDeckAction } from "@/app/_components/hotkeys/deck-actions-bus";
import { autogenerateCategories } from "@/app/_actions/deck/categories";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { ChevronDown, Eye, ListRestart, Mountain, Wand2 } from "lucide-react";
import {
  useDeckViewOptions,
  type DeckViewOptionKey,
  type DeckViewOptions,
} from "@/app/_components/builder/decklist";
import {
  parseSortDir,
  parseSortKey,
  type GroupBy,
  type SortDir,
  type SortKey,
} from "@/lib/deck/group-sort";
import type { Format } from "@/lib/generated/prisma/enums";
import type { PipSkew } from "@/lib/deck/manabase/allocate";

type ViewMode = "text" | "stack";

interface DecklistToolbarProps {
  deckId: string;
  deckFormat: Format;
  isOwner: boolean;
  initialBulkEditText: string;
  viewerId?: string | undefined;
  colorIdentity: string[];
  pips: PipSkew;
  currentLandCount: number;
  showAddLands?: boolean;
  showAutoCategorize?: boolean;
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
  viewerId,
  colorIdentity,
  pips,
  currentLandCount,
  showAddLands = true,
  showAutoCategorize = true,
}: DecklistToolbarProps) {
  const { options: viewOptions, toggle: toggleViewOption } =
    useDeckViewOptions(deckId);
  const router = useRouter();
  const searchParams = useSearchParams();
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
            {showAddLands && (
              <AddLandsDialog
                deckId={deckId}
                format={deckFormat}
                colorIdentity={colorIdentity}
                pips={pips}
                currentLandCount={currentLandCount}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    aria-label="Add lands"
                  >
                    <Mountain className="size-3.5" aria-hidden />
                    Add lands
                  </Button>
                }
              />
            )}
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
            {showAutoCategorize && groupBy === "category" && (
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
          </>
        )}
        <ViewOptionsMenu
          options={viewOptions}
          onToggle={toggleViewOption}
          showOwnership={!!viewerId}
        />
      </div>
    </div>
  );
}

interface ViewOptionsMenuProps {
  options: DeckViewOptions;
  onToggle: (key: DeckViewOptionKey) => void;
  showOwnership: boolean;
}

function ViewOptionsMenu({ options, onToggle, showOwnership }: ViewOptionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="View options"
      >
        <Eye className="size-3.5" aria-hidden />
        View options
        <ChevronDown className="size-3 ml-0.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show in row</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={options.manaValues}
            onCheckedChange={() => onToggle("manaValues")}
            closeOnClick={false}
          >
            Mana values
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={options.price}
            onCheckedChange={() => onToggle("price")}
            closeOnClick={false}
          >
            Price
          </DropdownMenuCheckboxItem>
          {showOwnership && (
            <DropdownMenuCheckboxItem
              checked={options.ownership}
              onCheckedChange={() => onToggle("ownership")}
              closeOnClick={false}
            >
              Ownership
            </DropdownMenuCheckboxItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
