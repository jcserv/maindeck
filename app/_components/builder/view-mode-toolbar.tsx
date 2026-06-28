"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Group, Layers, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { GroupBy, SortDir, SortKey } from "@/lib/deck/group-sort";

type ViewMode = "text" | "stack";

interface ViewModeToolbarProps {
  view: ViewMode;
  groupBy: GroupBy;
  sortKey: SortKey;
  sortDir: SortDir;
  // Grouping by ownership requires the viewer's holdings, so only offer it to a
  // signed-in viewer.
  showOwnership?: boolean;
  onChange: (next: {
    view?: ViewMode;
    groupBy?: GroupBy;
    sortKey?: SortKey;
    sortDir?: SortDir;
  }) => void;
}

const GROUP_LABELS: Record<GroupBy, string> = {
  category: "Category",
  type: "Type",
  color: "Color",
  mv: "Mana value",
  set: "Set",
  rarity: "Rarity",
  ownership: "Ownership",
};

const GROUP_CHIP: Record<GroupBy, string> = {
  category: "Category",
  type: "Type",
  color: "Color",
  mv: "Mana value",
  set: "Set",
  rarity: "Rarity",
  ownership: "Ownership",
};

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  mv: "Mana value",
  price: "Price",
  rarity: "Rarity",
};

const GROUP_VALUES: GroupBy[] = [
  "category",
  "type",
  "color",
  "mv",
  "set",
  "rarity",
];
const SORT_VALUES: SortKey[] = ["name", "mv", "price", "rarity"];

export function ViewModeToolbar({
  view,
  groupBy,
  sortKey,
  sortDir,
  showOwnership = false,
  onChange,
}: ViewModeToolbarProps) {
  const [groupOpen, setGroupOpen] = useState(false);
  const groupValues = showOwnership
    ? [...GROUP_VALUES, "ownership" as GroupBy]
    : GROUP_VALUES;

  return (
    <div
      role="toolbar"
      aria-label="Deck view controls"
      className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5"
    >
      <div className="flex items-center gap-0.5" role="group" aria-label="View mode">
        <Button
          variant={view === "text" ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Text view"
          aria-pressed={view === "text"}
          onClick={() => onChange({ view: "text" })}
        >
          <List className="size-4" aria-hidden />
        </Button>
        <Button
          variant={view === "stack" ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Stack view"
          aria-pressed={view === "stack"}
          onClick={() => onChange({ view: "stack" })}
        >
          <Layers className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="w-px h-5 bg-border shrink-0" role="separator" aria-orientation="vertical" />

      <DropdownMenu open={groupOpen} onOpenChange={setGroupOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Group: ${GROUP_LABELS[groupBy]}, sort: ${SORT_LABELS[sortKey]} ${sortDir}`}
            >
              <Group className="size-4" aria-hidden />
              <span className="hidden sm:inline ml-1">{GROUP_CHIP[groupBy]}</span>
              <ChevronDown className="size-3 ml-0.5 opacity-60" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
              Group by
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={groupBy}
              onValueChange={(v) =>
                onChange({ groupBy: v as GroupBy })
              }
            >
              {groupValues.map((opt) => (
                <DropdownMenuRadioItem key={opt} value={opt}>
                  {GROUP_LABELS[opt]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
              Sort within group
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({ sortDir: sortDir === "asc" ? "desc" : "asc" })
              }
              className="h-6 px-1.5 text-[11px] font-medium gap-1"
              aria-label={`Toggle sort direction (currently ${sortDir === "asc" ? "ascending" : "descending"})`}
            >
              {sortDir === "asc" ? (
                <ArrowUp className="size-3" aria-hidden />
              ) : (
                <ArrowDown className="size-3" aria-hidden />
              )}
              {sortDir === "asc" ? "ASC" : "DESC"}
            </Button>
          </div>

          <DropdownMenuRadioGroup
            value={sortKey}
            onValueChange={(v) => onChange({ sortKey: v as SortKey })}
          >
            {SORT_VALUES.map((opt) => (
              <DropdownMenuRadioItem key={opt} value={opt}>
                {SORT_LABELS[opt]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
