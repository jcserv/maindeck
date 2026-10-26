"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, ChevronDown, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBulkSelection } from "@/app/_components/builder/bulk-selection";
import { orderZoneOptions } from "@/app/_components/builder/move-card-menu";
import { applyBulkCardAction } from "@/app/_actions/deck/bulk-actions";
import {
  planBulkCardAction,
  toZoneAction,
  type BulkCardAction,
} from "@/lib/deck/bulk-actions";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";
import { cn, toTitleCase } from "@/lib/utils";

interface BulkActionBarProps {
  deckId: string;
  cards: DeckCard[];
  dispatch: (action: ZoneAction) => void;
  subcategories: string[];
  commanderSet: boolean;
}

function CategorySubmenu({
  label,
  names,
  onSelect,
}: {
  label: string;
  names: (string | null)[];
  onSelect: (name: string | null) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={names.length === 0}>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
        {names.map((name) => (
          <DropdownMenuItem key={name ?? ""} onClick={() => onSelect(name)}>
            {name === null ? (
              <span className="italic text-muted-foreground">
                Uncategorized
              </span>
            ) : (
              toTitleCase(name)
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function BulkActionBar({
  deckId,
  cards,
  dispatch,
  subcategories,
  commanderSet,
}: BulkActionBarProps) {
  const selection = useBulkSelection();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!selection?.active) return null;

  const targets = [...selection.selected.values()];
  const count = targets.length;
  const known = new Set(subcategories);

  function plan(action: BulkCardAction) {
    return planBulkCardAction(cards, targets, action, known);
  }

  function run(action: BulkCardAction) {
    const changes = plan(action);
    if (changes.length === 0) return;
    const requested = targets;
    startTransition(async () => {
      for (const change of changes) {
        const zoneAction = toZoneAction(change);
        if (zoneAction) dispatch(zoneAction);
      }
      await applyBulkCardAction(deckId, requested, action);
    });
    selection?.clear();
  }

  const removePlan = plan({ kind: "remove" });
  const deleteCount = removePlan.filter((c) => c.op === "remove").length;
  const stripCount = removePlan.length - deleteCount;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-4 z-40 flex justify-center px-4 pointer-events-none"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-1 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg",
          isPending && "opacity-70",
        )}
      >
        <span
          className="px-2 text-sm tabular-nums whitespace-nowrap"
          aria-live="polite"
        >
          {count} selected
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                disabled={count === 0}
                aria-label="Move"
              >
                <ArrowRightLeft aria-hidden />
                <span className="hidden sm:inline">Move</span>
                <ChevronDown aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent side="top" align="center" className="w-44">
            <DropdownMenuGroup>
              {orderZoneOptions(commanderSet).map(({ value, label }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => run({ kind: "moveZone", zone: value })}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                disabled={count === 0}
                aria-label="Category"
              >
                <Tags aria-hidden />
                <span className="hidden sm:inline">Category</span>
                <ChevronDown aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent side="top" align="center" className="w-48">
            <DropdownMenuGroup>
              <CategorySubmenu
                label="Set primary"
                names={[null, ...subcategories]}
                onSelect={(category) =>
                  run({ kind: "setPrimaryCategory", category })
                }
              />
              <CategorySubmenu
                label="Add to"
                names={subcategories}
                onSelect={(category) =>
                  category && run({ kind: "addCategory", category })
                }
              />
              <CategorySubmenu
                label="Remove from"
                names={subcategories}
                onSelect={(category) =>
                  category && run({ kind: "removeCategory", category })
                }
              />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          disabled={count === 0}
          onClick={() => setConfirmOpen(true)}
          aria-label="Delete"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden />
          <span className="hidden sm:inline">Delete</span>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Exit selection"
          onClick={() => selection.clear()}
        >
          <X aria-hidden />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          deleteCount > 0
            ? `Delete ${plural(count, "card")}?`
            : `Remove ${plural(count, "card")} from category?`
        }
        description={describeRemoval(deleteCount, stripCount)}
        confirmLabel={deleteCount > 0 ? "Delete" : "Remove"}
        onConfirm={() => run({ kind: "remove" })}
      />
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function describeRemoval(deleteCount: number, stripCount: number): string {
  const parts: string[] = [];
  if (deleteCount > 0) {
    parts.push(`${plural(deleteCount, "card")} will be removed from the deck`);
  }
  if (stripCount > 0) {
    parts.push(
      `${plural(stripCount, "card")} will lose only the selected secondary categories`,
    );
  }
  return `${parts.join("; ")}. You can revert this from the deck history.`;
}
