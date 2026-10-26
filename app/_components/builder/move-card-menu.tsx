"use client";

import { useState } from "react";
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
import {
  CardActionsPanel,
  cardActionsTabs,
  orderZoneOptions,
  useDeckCardMutations,
  type CardActionsTab,
} from "@/app/_components/builder/card-actions-panel";
import { cn, toTitleCase } from "@/lib/utils";
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [desktopOpenInternal, setDesktopOpenInternal] = useState(false);
  const [tab, setTab] = useState<CardActionsTab>("actions");

  const desktopOpen = open ?? desktopOpenInternal;
  const setDesktopOpen = (next: boolean) => {
    setDesktopOpenInternal(next);
    onOpenChange?.(next);
  };

  const mutations = useDeckCardMutations({
    deckId,
    deckCardId,
    currentZone,
    currentCategories,
    subcategories,
    dispatch,
  });
  const {
    isPending,
    moveToZone: handleZoneMove,
    toggleCategory,
    promoteCategory,
    clearCategories,
  } = mutations;

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

  const desktopTabs = cardActionsTabs(currentZone, subcategories);
  const showCategoryTab = desktopTabs.some((t) => t.value === "category");
  const activeTab: CardActionsTab =
    tab === "category" && !showCategoryTab ? "actions" : tab;

  function openDesktop(next: boolean) {
    if (next) setTab("actions");
    setDesktopOpen(next);
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
    // Shift+digit promotes a membership to primary; listed before the plain
    // digit toggles so shifted presses can't fall through to them.
    ...subcategories.slice(0, 9).map((name, idx) => ({
      key: String(idx + 1),
      shift: true,
      action: () => {
        promoteCategory(name);
      },
    })),
    // Number keys toggle membership without closing, so several categories
    // can be assigned in one menu visit.
    ...subcategories.slice(0, 9).map((name, idx) => ({
      key: String(idx + 1),
      action: () => {
        toggleCategory(name);
      },
    })),
  ]);

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
                      aria-label={
                        isMember && !isPrimary
                          ? `${toTitleCase(name)} — Enter toggles membership, Shift+${shortcut ?? ""} makes it primary`
                          : undefined
                      }
                      {...(shortcut && {
                        "aria-keyshortcuts": isMember && !isPrimary
                          ? `${shortcut} Shift+${shortcut}`
                          : shortcut,
                      })}
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
                        // Not a nested <button> — menuitems can't contain
                        // interactive children. Mouse promotes via this span;
                        // keyboard promotes via Shift+digit.
                        <span
                          role="presentation"
                          onClick={(e) => {
                            e.stopPropagation();
                            promoteCategory(name);
                          }}
                          className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <Star className="size-3.5" aria-hidden />
                        </span>
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
          <CardActionsPanel
            currentZone={currentZone}
            commanderSet={commanderSet}
            currentCategories={currentCategories}
            subcategories={subcategories}
            quantity={quantity}
            onQuantityChange={onQuantityChange}
            mutations={mutations}
            onChangePrinting={onChangePrinting}
            inventoryActions={inventoryActions}
            onActionStart={() => setSheetOpen(false)}
          />
        </BottomSheet>
      </span>
    </>
  );
}
