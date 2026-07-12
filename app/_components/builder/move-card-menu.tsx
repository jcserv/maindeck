"use client";

import { useState, useTransition } from "react";
import { MoreVertical, Check, Layers, Minus, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BottomSheet from "@/app/_components/bottom-sheet";
import { useMenuShortcuts } from "@/app/_components/hotkeys/use-menu-shortcuts";
import { useInventoryActions } from "@/app/_components/builder/inventory-actions";
import { cn, toTitleCase } from "@/lib/utils";
import { moveCardTo, setCardCategories } from "@/app/_actions/deck/categories";
import type { ZoneAction } from "@/lib/deck/zone-view";
import type { OwnershipState } from "@/lib/inventory/state";
import type { Zone } from "@/lib/generated/prisma/client";

interface MoveCardMenuProps {
  deckId: string;
  deckCardId: string;
  cardName: string;
  currentZone: Zone;
  commanderSet: boolean;
  /** Ordered category memberships; `[0]` is the primary. */
  currentCategories: string[];
  subcategories: string[];
  quantity: number;
  onQuantityChange: (next: number) => void;
  dispatch: (action: ZoneAction) => void;
  onChangePrinting?: () => void;
  inventory?: {
    printingId: number | null;
    isFoil: boolean;
    ownershipState: OwnershipState;
    isPinned: boolean;
  };
  /** Controls the desktop dropdown; falls back to internal state when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ZoneOption = { value: Zone; label: string; key: string };

const ZONE_OPTIONS: ZoneOption[] = [
  { value: "COMMANDER", label: "Commander", key: "c" },
  { value: "COMPANION", label: "Companion", key: "o" },
  { value: "MAINBOARD", label: "Mainboard", key: "m" },
  { value: "SIDEBOARD", label: "Sideboard", key: "s" },
  { value: "CONSIDERING", label: "Considering", key: "i" },
];

/**
 * When a commander is already set, the Commander zone is rarely the intended
 * destination, so it drops to the bottom of the list. Order is unchanged
 * otherwise.
 */
export function orderZoneOptions(commanderSet: boolean): ZoneOption[] {
  if (!commanderSet) return ZONE_OPTIONS;
  const commander = ZONE_OPTIONS.find((o) => o.value === "COMMANDER")!;
  return [...ZONE_OPTIONS.filter((o) => o.value !== "COMMANDER"), commander];
}

type Tab = "actions" | "category" | "zone" ;

export function MoveCardMenu({
  deckId,
  deckCardId,
  cardName,
  currentZone,
  commanderSet,
  currentCategories,
  subcategories,
  quantity,
  onQuantityChange,
  dispatch,
  onChangePrinting,
  inventory,
  open,
  onOpenChange,
}: MoveCardMenuProps) {
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [desktopOpenInternal, setDesktopOpenInternal] = useState(false);
  const [tab, setTab] = useState<Tab>("actions");

  const desktopOpen = open ?? desktopOpenInternal;
  const setDesktopOpen = (next: boolean) => {
    setDesktopOpenInternal(next);
    onOpenChange?.(next);
  };

  const inventoryActions = useInventoryActions({
    ...(inventory ?? {
      printingId: null,
      isFoil: false,
      ownershipState: "NOT_OWNED",
      isPinned: false,
    }),
    sourceDeckId: deckId,
  });

  const zoneOptions = orderZoneOptions(commanderSet);

  const showCategoryTab =
    subcategories.length > 0 || currentZone === "MAINBOARD";
  const activeTab: Tab =
    tab === "category" && !showCategoryTab ? "actions" : tab;

  function openDesktop(next: boolean) {
    if (next) setTab("actions");
    setDesktopOpen(next);
  }

  function openSheet(next: boolean) {
    if (next) setTab("actions");
    setSheetOpen(next);
  }

  function handleZoneMove(nextZone: Zone) {
    if (nextZone === currentZone) return;
    startTransition(async () => {
      dispatch({ type: "move", deckCardId, zone: nextZone, categories: [] });
      await moveCardTo(deckId, deckCardId, nextZone, null);
    });
  }

  /**
   * Replace the card's memberships wholesale (order matters — `[0]` is the
   * primary). Cards outside MAINBOARD are moved there first, since categories
   * are MAINBOARD-only.
   */
  function applyCategories(next: string[]) {
    startTransition(async () => {
      dispatch({
        type: "move",
        deckCardId,
        zone: "MAINBOARD",
        categories: next,
      });
      if (currentZone === "MAINBOARD") {
        await setCardCategories(deckId, deckCardId, next);
      } else {
        await moveCardTo(deckId, deckCardId, "MAINBOARD", next[0] ?? null);
      }
    });
  }

  /**
   * Toggle membership. The first category added becomes the primary; removing
   * the primary promotes the next membership.
   */
  function toggleCategory(name: string) {
    if (currentZone !== "MAINBOARD") {
      applyCategories([name]);
      return;
    }
    const next = currentCategories.includes(name)
      ? currentCategories.filter((c) => c !== name)
      : [...currentCategories, name];
    applyCategories(next);
  }

  function promoteCategory(name: string) {
    if (currentZone !== "MAINBOARD" || currentCategories[0] === name) return;
    applyCategories([name, ...currentCategories.filter((c) => c !== name)]);
  }

  function clearCategories() {
    if (currentZone === "MAINBOARD" && currentCategories.length === 0) return;
    applyCategories([]);
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
    currentZone === "MAINBOARD" && currentCategories.length === 0;

  const onMenuKeyDown = useMenuShortcuts([
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
    ...zoneOptions.map(({ value, key }) => ({
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
        clearCategories();
      },
    },
    // Number keys toggle membership without closing, so several categories
    // can be assigned in one menu visit.
    ...subcategories.slice(0, 9).map((name, idx) => ({
      key: String(idx + 1),
      action: () => {
        toggleCategory(name);
      },
    })),
  ]);

  const desktopTabs: { value: Tab; label: string }[] = [
    { value: "actions", label: "Actions" },
    ...(showCategoryTab
      ? [{ value: "category" as Tab, label: "Category" }]
      : []),
    { value: "zone", label: "Zone" },
  ];

  return (
    <>
      {/* Desktop */}
      <span className="hidden md:contents">
        <DropdownMenu open={desktopOpen} onOpenChange={openDesktop}>
          <DropdownMenuTrigger render={triggerButton} />
          <DropdownMenuContent
            align="end"
            side="bottom"
            onKeyDown={onMenuKeyDown}
            className="w-56"
          >
            <div
              role="tablist"
              aria-label="Card actions"
              className="flex gap-0.5 p-1"
            >
              {desktopTabs.map(({ value, label }) => {
                const isActive = activeTab === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={(e) => {
                      e.preventDefault();
                      setTab(value);
                    }}
                    className={cn(
                      "flex-1 rounded-sm px-2 py-1 text-xs transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <DropdownMenuSeparator />

            {activeTab === "actions" && (
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
                {inventoryActions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {inventoryActions.map((action) => (
                      <DropdownMenuItem
                        key={action.key}
                        onClick={action.onSelect}
                        className="gap-2"
                      >
                        {action.icon}
                        <span>{action.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuGroup>
            )}

            {activeTab === "zone" && (
              <DropdownMenuGroup>
                {zoneOptions.map(({ value, label, key }) => {
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
                      <DropdownMenuShortcut>
                        {key.toUpperCase()}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            )}

            {activeTab === "category" && showCategoryTab && (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={isMainboardUncategorized}
                  closeOnClick={false}
                  onClick={() => clearCategories()}
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
                  const isMember =
                    currentZone === "MAINBOARD" &&
                    currentCategories.includes(name);
                  const isPrimary =
                    currentZone === "MAINBOARD" &&
                    currentCategories[0] === name;
                  const shortcut = idx < 9 ? String(idx + 1) : null;
                  return (
                    <DropdownMenuItem
                      key={name}
                      closeOnClick={false}
                      onClick={() => toggleCategory(name)}
                      className="gap-2"
                    >
                      {isMember && (
                        <Check className="size-3.5 shrink-0" aria-hidden />
                      )}
                      <span className={cn(!isMember && "pl-5", "flex-1")}>
                        {toTitleCase(name)}
                      </span>
                      {isPrimary ? (
                        <Star
                          className="size-3.5 shrink-0 fill-current"
                          aria-label="Primary category"
                        />
                      ) : isMember ? (
                        <button
                          type="button"
                          aria-label={`Make ${toTitleCase(name)} the primary category`}
                          onClick={(e) => {
                            e.stopPropagation();
                            promoteCategory(name);
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <Star className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                      {shortcut && (
                        <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
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
          onClick={() => openSheet(true)}
          className={cn(
            "size-11 shrink-0 text-muted-foreground",
            isPending && "opacity-50",
          )}
        >
          <MoreVertical className="size-3.5" aria-hidden />
        </Button>

        <BottomSheet
          open={sheetOpen}
          onOpenChange={openSheet}
          title={cardName}
        >
          <div className="flex flex-col pt-1">
            <div
              role="tablist"
              aria-label="Card actions"
              className="flex gap-1 px-3 pb-3"
            >
              {desktopTabs.map(({ value, label }) => {
                const isActive = activeTab === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setTab(value)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {activeTab === "actions" && (
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
                {inventoryActions.length > 0 && (
                  <>
                    <li className="mx-3 my-1 border-t border-border" aria-hidden />
                    {inventoryActions.map((action) => (
                      <li key={action.key}>
                        <button
                          type="button"
                          onClick={() => {
                            setSheetOpen(false);
                            action.onSelect();
                          }}
                          className="w-full flex items-center gap-2 rounded-md px-3 min-h-9 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {action.icon}
                          <span>{action.label}</span>
                        </button>
                      </li>
                    ))}
                  </>
                )}
              </ul>
            )}

            {activeTab === "zone" && (
              <ul className="flex flex-col">
                {zoneOptions.map(({ value, label }) => {
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
            )}

            {activeTab === "category" && showCategoryTab && (
              <ul className="flex flex-col">
                <li>
                  <button
                    type="button"
                    disabled={isMainboardUncategorized}
                    onClick={() => clearCategories()}
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
                  const isMember =
                    currentZone === "MAINBOARD" &&
                    currentCategories.includes(name);
                  const isPrimary =
                    currentZone === "MAINBOARD" &&
                    currentCategories[0] === name;
                  return (
                    <li key={name}>
                      <div
                        className="w-full flex items-center gap-2 rounded-md pl-6 pr-3 min-h-9 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategory(name)}
                          className="flex flex-1 items-center gap-2 text-left min-h-9"
                        >
                          {isMember && (
                            <Check className="size-4 shrink-0" aria-hidden />
                          )}
                          <span className={cn(!isMember && "pl-6")}>
                            {toTitleCase(name)}
                          </span>
                        </button>
                        {isPrimary ? (
                          <Star
                            className="size-4 shrink-0 fill-current"
                            aria-label="Primary category"
                          />
                        ) : isMember ? (
                          <button
                            type="button"
                            aria-label={`Make ${toTitleCase(name)} the primary category`}
                            onClick={() => promoteCategory(name)}
                            className="shrink-0 p-2 -m-2 text-muted-foreground hover:text-foreground"
                          >
                            <Star className="size-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </BottomSheet>
      </span>
    </>
  );
}
