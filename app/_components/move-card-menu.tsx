"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Check, Layers, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BottomSheet from "@/app/_components/bottom-sheet";
import { useMenuShortcuts } from "@/app/_components/hotkeys/use-menu-shortcuts";
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
  onChangePrinting?: () => void;
}

const ZONE_OPTIONS: { value: Zone; label: string; key: string }[] = [
  { value: "COMMANDER", label: "Commander", key: "c" },
  { value: "MAINBOARD", label: "Mainboard", key: "m" },
  { value: "SIDEBOARD", label: "Sideboard", key: "s" },
  { value: "CONSIDERING", label: "Considering", key: "i" },
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
  onChangePrinting,
}: MoveCardMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);

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

  useMenuShortcuts(desktopOpen, [
    {
      key: "+",
      action: () => {
        onQuantityChange(quantity + 1);
        setDesktopOpen(false);
      },
    },
    {
      key: "=",
      action: () => {
        onQuantityChange(quantity + 1);
        setDesktopOpen(false);
      },
    },
    {
      key: "-",
      disabled: quantity <= 1,
      action: () => {
        onQuantityChange(quantity - 1);
        setDesktopOpen(false);
      },
    },
    {
      key: "p",
      disabled: !onChangePrinting,
      action: () => {
        onChangePrinting?.();
        setDesktopOpen(false);
      },
    },
    ...ZONE_OPTIONS.map(({ value, key }) => ({
      key,
      disabled: value === currentZone,
      action: () => {
        handleZoneMove(value);
        setDesktopOpen(false);
      },
    })),
    {
      key: "0",
      disabled: isMainboardUncategorized,
      action: () => {
        handleSubcategoryMove(null);
        setDesktopOpen(false);
      },
    },
    ...subcategories.slice(0, 9).map((name, idx) => ({
      key: String(idx + 1),
      disabled:
        currentZone === "MAINBOARD" && currentSubcategory === name,
      action: () => {
        handleSubcategoryMove(name);
        setDesktopOpen(false);
      },
    })),
  ]);

  return (
    <>
      {/* Desktop */}
      <span className="hidden md:contents">
        <DropdownMenu open={desktopOpen} onOpenChange={setDesktopOpen}>
          <DropdownMenuTrigger render={triggerButton} />
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => onQuantityChange(quantity + 1)}
                className="gap-2"
              >
                <Plus className="size-3.5 shrink-0" aria-hidden />
                <span>Add one</span>
                <DropdownMenuShortcut>+</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={quantity <= 1}
                onClick={() => onQuantityChange(quantity - 1)}
                className="gap-2"
              >
                <Minus className="size-3.5 shrink-0" aria-hidden />
                <span>Remove one</span>
                <DropdownMenuShortcut>−</DropdownMenuShortcut>
              </DropdownMenuItem>
              {onChangePrinting && (
                <DropdownMenuItem
                  onClick={() => onChangePrinting()}
                  className="gap-2"
                >
                  <Layers className="size-3.5 shrink-0" aria-hidden />
                  <span>Change printing</span>
                  <DropdownMenuShortcut>P</DropdownMenuShortcut>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Zone</DropdownMenuLabel>
              {ZONE_OPTIONS.map(({ value, label, key }) => {
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
                    <DropdownMenuShortcut>{key.toUpperCase()}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            {(subcategories.length > 0 || currentZone === "MAINBOARD") && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Category</DropdownMenuLabel>
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
                    <DropdownMenuShortcut>0</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  {subcategories.map((name, idx) => {
                    const isCurrent =
                      currentZone === "MAINBOARD" &&
                      currentSubcategory === name;
                    const shortcut = idx < 9 ? String(idx + 1) : null;
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
                        {shortcut && (
                          <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
                        )}
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
          title={cardName}
        >
          <div className="flex flex-col pt-1">
            <ul className="flex flex-col">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSheetOpen(false);
                    onQuantityChange(quantity + 1);
                  }}
                  className="w-full flex items-center gap-2 rounded-md px-3 min-h-9 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground"
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
                    "w-full flex items-center gap-2 rounded-md px-3 min-h-9 text-sm text-left transition-colors",
                    quantity <= 1
                      ? "text-muted-foreground cursor-default"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Minus className="size-4 shrink-0" aria-hidden />
                  <span>Remove one</span>
                </button>
              </li>
              {onChangePrinting && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(false);
                      onChangePrinting();
                    }}
                    className="w-full flex items-center gap-2 rounded-md px-3 min-h-9 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Layers className="size-4 shrink-0" aria-hidden />
                    <span>Change printing</span>
                  </button>
                </li>
              )}
            </ul>

            <div className="mt-3 pt-3 border-t border-border/60">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-3 mb-0.5">
                Zone
              </h3>
              <ul className="flex flex-col">
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
                          "w-full flex items-center gap-2 rounded-md px-3 min-h-9 text-sm text-left transition-colors",
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
              <div className="mt-3 pt-3 border-t border-border/60">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-3 mb-0.5">
                  Category
                </h3>
                <ul className="flex flex-col">
                  <li>
                    <button
                      type="button"
                      disabled={isMainboardUncategorized}
                      onClick={() => {
                        setSheetOpen(false);
                        handleSubcategoryMove(null);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-md pl-6 pr-3 min-h-9 text-sm text-left transition-colors italic",
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
                            "w-full flex items-center gap-2 rounded-md pl-6 pr-3 min-h-9 text-sm text-left transition-colors",
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
