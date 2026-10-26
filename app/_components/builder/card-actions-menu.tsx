"use client";

import { useState, type ReactNode } from "react";
import { Check, Layers, Minus, Plus, Star } from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { useMenuShortcuts } from "@/app/_components/hotkeys/use-menu-shortcuts";
import {
  cardActionsTabs,
  orderZoneOptions,
  type CardActionItem,
  type CardActionsTab,
  type DeckCardMutations,
} from "@/app/_components/builder/card-actions-panel";
import { cn, toTitleCase } from "@/lib/utils";
import type { Zone } from "@/lib/generated/prisma/client";

interface CardActionsMenuContentProps {
  currentZone: Zone;
  commanderSet: boolean;
  /** Ordered category memberships; `[0]` is the primary. */
  currentCategories: string[];
  subcategories: string[];
  quantity: number;
  onQuantityChange: (next: number) => void;
  mutations: Pick<
    DeckCardMutations,
    "moveToZone" | "toggleCategory" | "promoteCategory" | "clearCategories"
  >;
  onChangePrinting?: (() => void) | undefined;
  inventoryActions: CardActionItem[];
  onClose: () => void;
  header?: ReactNode;
  extraActions?: ReactNode;
}

export function CardActionsMenuContent({
  currentZone,
  commanderSet,
  currentCategories,
  subcategories,
  quantity,
  onQuantityChange,
  mutations,
  onChangePrinting,
  inventoryActions,
  onClose,
  header,
  extraActions,
}: CardActionsMenuContentProps) {
  const [tab, setTab] = useState<CardActionsTab>("actions");

  const zoneOptions = orderZoneOptions(commanderSet);
  const tabs = cardActionsTabs(currentZone, subcategories);
  const showCategoryTab = tabs.some((t) => t.value === "category");
  const activeTab: CardActionsTab =
    tab === "category" && !showCategoryTab ? "actions" : tab;

  const isMainboardUncategorized =
    currentZone === "MAINBOARD" && currentCategories.length === 0;
  const onMenuKeyDown = useCardActionShortcuts({
    currentZone,
    zoneOptions,
    subcategories,
    quantity,
    onQuantityChange,
    mutations,
    onChangePrinting,
    isMainboardUncategorized,
    onClose,
  });

  return (
    <DropdownMenuContent
      align="end"
      side="bottom"
      onKeyDown={onMenuKeyDown}
      className="w-56 max-md:**:data-[slot=dropdown-menu-item]:min-h-9"
    >
      {header}
      <div role="tablist" aria-label="Card actions" className="flex gap-0.5 p-1">
        {tabs.map(({ value, label }) => {
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
          {extraActions}
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
                onClick={() => mutations.moveToZone(value)}
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
      )}

      {activeTab === "category" && showCategoryTab && (
        <CategoryGroup
          currentZone={currentZone}
          currentCategories={currentCategories}
          subcategories={subcategories}
          mutations={mutations}
        />
      )}
    </DropdownMenuContent>
  );
}

type CardActionsMutations = CardActionsMenuContentProps["mutations"];

function useCardActionShortcuts({
  currentZone,
  zoneOptions,
  subcategories,
  quantity,
  onQuantityChange,
  mutations: { moveToZone, toggleCategory, promoteCategory, clearCategories },
  onChangePrinting,
  isMainboardUncategorized,
  onClose,
}: Pick<
  CardActionsMenuContentProps,
  | "currentZone"
  | "subcategories"
  | "quantity"
  | "onQuantityChange"
  | "mutations"
  | "onChangePrinting"
  | "onClose"
> & {
  zoneOptions: ReturnType<typeof orderZoneOptions>;
  isMainboardUncategorized: boolean;
}) {
  return useMenuShortcuts([
    {
      key: "+",
      action: () => {
        onQuantityChange(quantity + 1);
        onClose();
      },
    },
    {
      key: "=",
      action: () => {
        onQuantityChange(quantity + 1);
        onClose();
      },
    },
    {
      key: "-",
      disabled: quantity <= 1,
      action: () => {
        onQuantityChange(quantity - 1);
        onClose();
      },
    },
    {
      key: "p",
      disabled: !onChangePrinting,
      action: () => {
        onChangePrinting?.();
        onClose();
      },
    },
    ...zoneOptions.map(({ value, key }) => ({
      key,
      disabled: value === currentZone,
      action: () => {
        moveToZone(value);
        onClose();
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
}

function CategoryGroup({
  currentZone,
  currentCategories,
  subcategories,
  mutations,
}: {
  currentZone: Zone;
  currentCategories: string[];
  subcategories: string[];
  mutations: CardActionsMutations;
}) {
  const isMainboardUncategorized =
    currentZone === "MAINBOARD" && currentCategories.length === 0;
  return (
      <DropdownMenuGroup>
        <DropdownMenuItem
          disabled={isMainboardUncategorized}
          closeOnClick={false}
          onClick={() => mutations.clearCategories()}
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
            currentZone === "MAINBOARD" && currentCategories.includes(name);
          const isPrimary =
            currentZone === "MAINBOARD" && currentCategories[0] === name;
          const shortcut = idx < 9 ? String(idx + 1) : null;
          return (
            <DropdownMenuItem
              key={name}
              closeOnClick={false}
              onClick={() => mutations.toggleCategory(name)}
              aria-label={
                isMember && !isPrimary
                  ? `${toTitleCase(name)} — Enter toggles membership, Shift+${shortcut ?? ""} makes it primary`
                  : undefined
              }
              {...(shortcut && {
                "aria-keyshortcuts":
                  isMember && !isPrimary
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
                    mutations.promoteCategory(name);
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
  );
}
