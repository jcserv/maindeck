"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Check, Minus, Plus } from "lucide-react";
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
import BottomSheet from "@/app/_components/bottom-sheet";
import { cn } from "@/lib/utils";
import { moveCardTo } from "@/lib/deck/category-actions";
import type { ZoneAction } from "@/lib/deck/zone-view";
import type { Zone } from "@/lib/generated/prisma/client";

interface MoveCardMenuProps {
  deckId: string;
  deckCardId: string;
  cardName: string;
  currentZone: Zone;
  currentSubcategory: string | null;
  subcategories: string[];
  quantity: number;
  onQuantityChange: (next: number) => void;
  dispatch: (action: ZoneAction) => void;
}

const ZONE_OPTIONS: { value: Zone; label: string }[] = [
  { value: "COMMANDER", label: "Commander" },
  { value: "MAINBOARD", label: "Mainboard" },
  { value: "SIDEBOARD", label: "Sideboard" },
  { value: "CONSIDERING", label: "Considering" },
];

export function MoveCardMenu({
  deckId,
  deckCardId,
  cardName,
  currentZone,
  currentSubcategory,
  subcategories,
  quantity,
  onQuantityChange,
  dispatch,
}: MoveCardMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);

  function move(nextZone: Zone, nextCategory: string | null) {
    startTransition(async () => {
      dispatch({
        type: "move",
        deckCardId,
        zone: nextZone,
        category: nextCategory,
      });
      try {
        await moveCardTo(deckId, deckCardId, nextZone, nextCategory);
      } finally {
        router.refresh();
      }
    });
  }

  function handleZoneMove(nextZone: Zone) {
    if (nextZone === currentZone) return;
    const nextCategory = nextZone === "MAINBOARD" ? currentSubcategory : null;
    move(nextZone, nextCategory);
  }

  function handleSubcategoryMove(nextSubcategory: string | null) {
    if (currentZone === "MAINBOARD" && currentSubcategory === nextSubcategory) {
      return;
    }
    move("MAINBOARD", nextSubcategory);
  }

  const triggerButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Move card"
      disabled={isPending}
      className={cn(
        "size-11 shrink-0 md:size-7 text-muted-foreground",
        isPending && "opacity-50",
      )}
    >
      <MoreVertical className="size-3.5" aria-hidden />
    </Button>
  );

  const isMainboardUncategorized =
    currentZone === "MAINBOARD" && currentSubcategory === null;

  return (
    <>
      {/* Desktop */}
      <span className="hidden md:contents">
        <DropdownMenu>
          <DropdownMenuTrigger render={triggerButton} />
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Quantity</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onQuantityChange(quantity + 1)}
                className="gap-2"
              >
                <Plus className="size-3.5 shrink-0" aria-hidden />
                <span>Add one</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={quantity <= 1}
                onClick={() => onQuantityChange(quantity - 1)}
                className="gap-2"
              >
                <Minus className="size-3.5 shrink-0" aria-hidden />
                <span>Remove one</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to zone</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ZONE_OPTIONS.map(({ value, label }) => {
                const isCurrent = value === currentZone;
                return (
                  <DropdownMenuItem
                    key={value}
                    disabled={isCurrent}
                    onClick={() => handleZoneMove(value)}
                    className="gap-2"
                  >
                    {isCurrent && (
                      <Check className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className={cn(!isCurrent && "pl-5")}>{label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            {(subcategories.length > 0 || currentZone === "MAINBOARD") && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Mainboard subcategory</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isMainboardUncategorized}
                    onClick={() => handleSubcategoryMove(null)}
                    className="gap-2"
                  >
                    {isMainboardUncategorized && (
                      <Check className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span
                      className={cn(
                        !isMainboardUncategorized && "pl-5",
                        "italic text-muted-foreground",
                      )}
                    >
                      Uncategorized
                    </span>
                  </DropdownMenuItem>
                  {subcategories.map((name) => {
                    const isCurrent =
                      currentZone === "MAINBOARD" &&
                      currentSubcategory === name;
                    return (
                      <DropdownMenuItem
                        key={name}
                        disabled={isCurrent}
                        onClick={() => handleSubcategoryMove(name)}
                        className="gap-2"
                      >
                        {isCurrent && (
                          <Check className="size-3.5 shrink-0" aria-hidden />
                        )}
                        <span className={cn(!isCurrent && "pl-5", "uppercase")}>
                          {name}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      {/* Mobile */}
      <span className="contents md:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Move card"
          disabled={isPending}
          onClick={() => setSheetOpen(true)}
          className={cn(
            "size-11 shrink-0 text-muted-foreground",
            isPending && "opacity-50",
          )}
        >
          <MoreVertical className="size-3.5" aria-hidden />
        </Button>

        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={`Move card - ${cardName}`}
        >
          <div className="flex flex-col gap-4 pt-2">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-1">
                Quantity
              </h3>
              <ul className="flex flex-col gap-0.5">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(false);
                      onQuantityChange(quantity + 1);
                    }}
                    className="w-full flex items-center gap-2 rounded-md px-3 min-h-11 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Plus className="size-4 shrink-0" aria-hidden />
                    <span>Add one</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    disabled={quantity <= 1}
                    onClick={() => {
                      setSheetOpen(false);
                      onQuantityChange(quantity - 1);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-3 min-h-11 text-sm text-left transition-colors",
                      quantity <= 1
                        ? "text-muted-foreground cursor-default"
                        : "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Minus className="size-4 shrink-0" aria-hidden />
                    <span>Remove one</span>
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-1">
                Zone
              </h3>
              <ul className="flex flex-col gap-0.5">
                {ZONE_OPTIONS.map(({ value, label }) => {
                  const isCurrent = value === currentZone;
                  return (
                    <li key={value}>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() => {
                          setSheetOpen(false);
                          handleZoneMove(value);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 rounded-md px-3 min-h-11 text-sm text-left transition-colors",
                          isCurrent
                            ? "text-muted-foreground cursor-default"
                            : "hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        {isCurrent && (
                          <Check className="size-4 shrink-0" aria-hidden />
                        )}
                        <span className={cn(!isCurrent && "pl-6")}>
                          {label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {(subcategories.length > 0 || currentZone === "MAINBOARD") && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-1">
                  Mainboard subcategory
                </h3>
                <ul className="flex flex-col gap-0.5">
                  <li>
                    <button
                      type="button"
                      disabled={isMainboardUncategorized}
                      onClick={() => {
                        setSheetOpen(false);
                        handleSubcategoryMove(null);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-md pl-6 pr-3 min-h-11 text-sm text-left transition-colors italic",
                        isMainboardUncategorized
                          ? "text-muted-foreground cursor-default"
                          : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                      )}
                    >
                      {isMainboardUncategorized && (
                        <Check className="size-4 shrink-0" aria-hidden />
                      )}
                      <span className={cn(!isMainboardUncategorized && "pl-6")}>
                        Uncategorized
                      </span>
                    </button>
                  </li>
                  {subcategories.map((name) => {
                    const isCurrent =
                      currentZone === "MAINBOARD" &&
                      currentSubcategory === name;
                    return (
                      <li key={name}>
                        <button
                          type="button"
                          disabled={isCurrent}
                          onClick={() => {
                            setSheetOpen(false);
                            handleSubcategoryMove(name);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-md pl-6 pr-3 min-h-11 text-sm text-left transition-colors",
                            isCurrent
                              ? "text-muted-foreground cursor-default"
                              : "hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          {isCurrent && (
                            <Check className="size-4 shrink-0" aria-hidden />
                          )}
                          <span className={cn(!isCurrent && "pl-6", "uppercase")}>
                            {name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </BottomSheet>
      </span>
    </>
  );
}
