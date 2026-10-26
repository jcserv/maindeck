"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Check, Layers, Minus, Plus, Star } from "lucide-react";
import { cn, toTitleCase } from "@/lib/utils";
import { moveCardTo, setCardCategories } from "@/app/_actions/deck/categories";
import {
  removeCardFromDeck,
  updateCardQuantity,
} from "@/lib/deck/editor-actions";
import type { ZoneAction } from "@/lib/deck/zone-view";
import type { Zone } from "@/lib/generated/prisma/client";

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

/**
 * Drop membership names that are no longer in the live category registry. A
 * category can be deleted (by this user in another tab or by a collaborator)
 * while this menu is open, leaving a stale entry in `currentCategories`;
 * dispatching it would trip the error boundary. Preserves order. See issue #88.
 */
export function filterLiveCategories(
  next: string[],
  subcategories: string[],
): string[] {
  const live = new Set(subcategories);
  return next.filter((c) => live.has(c));
}

export type CardActionsTab = "actions" | "category" | "zone";

export function cardActionsTabs(
  currentZone: Zone,
  subcategories: string[],
): { value: CardActionsTab; label: string }[] {
  const showCategoryTab =
    subcategories.length > 0 || currentZone === "MAINBOARD";
  return [
    { value: "actions", label: "Actions" },
    ...(showCategoryTab
      ? [{ value: "category" as CardActionsTab, label: "Category" }]
      : []),
    { value: "zone", label: "Zone" },
  ];
}

interface UseDeckCardMutationsOptions {
  deckId: string;
  deckCardId: string;
  currentZone: Zone;
  /** Ordered category memberships; `[0]` is the primary. */
  currentCategories: string[];
  subcategories: string[];
  dispatch: (action: ZoneAction) => void;
}

export type DeckCardMutations = ReturnType<typeof useDeckCardMutations>;

export function useDeckCardMutations({
  deckId,
  deckCardId,
  currentZone,
  currentCategories,
  subcategories,
  dispatch,
}: UseDeckCardMutationsOptions) {
  const [isPending, startTransition] = useTransition();
  // Rapid toggles (number keys) fire overlapping server mutations whose
  // read-modify-write bodies can interleave and drop memberships. Optimistic
  // dispatch stays immediate; only the server calls serialize through here.
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  function enqueueMutation(fn: () => Promise<void>): Promise<void> {
    const next = mutationQueueRef.current.then(fn, fn);
    mutationQueueRef.current = next;
    return next;
  }

  function changeQuantity(next: number) {
    startTransition(async () => {
      dispatch({ type: "update", deckCardId, quantity: next });
      await enqueueMutation(() => updateCardQuantity(deckId, deckCardId, next));
    });
  }

  function remove() {
    startTransition(async () => {
      dispatch({ type: "remove", deckCardId });
      await enqueueMutation(() => removeCardFromDeck(deckId, deckCardId));
    });
  }

  function moveToZone(nextZone: Zone) {
    if (nextZone === currentZone) return;
    startTransition(async () => {
      dispatch({ type: "move", deckCardId, zone: nextZone, categories: [] });
      await enqueueMutation(() => moveCardTo(deckId, deckCardId, nextZone, null));
    });
  }

  /**
   * Replace the card's memberships wholesale (order matters — `[0]` is the
   * primary). Cards outside MAINBOARD are moved there first, since categories
   * are MAINBOARD-only.
   */
  function applyCategories(next: string[]) {
    // Drop any membership no longer in the live registry so a stale entry is
    // never dispatched. The server actions tolerate unknown names too (issue
    // #88); this keeps the optimistic view in sync once `subcategories` has
    // refreshed.
    const filtered = filterLiveCategories(next, subcategories);
    startTransition(async () => {
      dispatch({
        type: "move",
        deckCardId,
        zone: "MAINBOARD",
        categories: filtered,
      });
      if (currentZone === "MAINBOARD") {
        await enqueueMutation(() =>
          setCardCategories(deckId, deckCardId, filtered),
        );
      } else {
        await enqueueMutation(() =>
          moveCardTo(deckId, deckCardId, "MAINBOARD", filtered[0] ?? null),
        );
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

  return {
    isPending,
    changeQuantity,
    remove,
    moveToZone,
    toggleCategory,
    promoteCategory,
    clearCategories,
  };
}

export interface CardActionItem {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface CardActionsPanelProps {
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
  /** Called before a one-shot action runs (not on category toggles). */
  onActionStart?: (() => void) | undefined;
  className?: string;
}

const ROW_BUTTON =
  "w-full flex items-center gap-2 rounded-md px-3 min-h-9 text-sm text-left transition-colors";
const ROW_ENABLED = "hover:bg-accent hover:text-accent-foreground";
const ROW_DISABLED = "text-muted-foreground cursor-default";

/**
 * Touch-friendly tabbed card actions (quantity, printing, inventory, category,
 * zone) for the mobile `MoveCardMenu` sheet.
 */
export function CardActionsPanel({
  currentZone,
  commanderSet,
  currentCategories,
  subcategories,
  quantity,
  onQuantityChange,
  mutations,
  onChangePrinting,
  inventoryActions,
  onActionStart,
  className,
}: CardActionsPanelProps) {
  const [tab, setTab] = useState<CardActionsTab>("actions");
  const tabs = cardActionsTabs(currentZone, subcategories);
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "actions";
  const zoneOptions = orderZoneOptions(commanderSet);
  const isMainboardUncategorized =
    currentZone === "MAINBOARD" && currentCategories.length === 0;

  function run(fn: () => void) {
    onActionStart?.();
    fn();
  }

  return (
    <div className={cn("flex flex-col pt-1", className)}>
      <div
        role="tablist"
        aria-label="Card actions"
        className="flex gap-1 px-3 pb-3"
      >
        {tabs.map(({ value, label }) => {
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
              onClick={() => run(() => onQuantityChange(quantity + 1))}
              className={cn(ROW_BUTTON, ROW_ENABLED)}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              <span>Add one</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={quantity <= 1}
              onClick={() => run(() => onQuantityChange(quantity - 1))}
              className={cn(
                ROW_BUTTON,
                quantity <= 1 ? ROW_DISABLED : ROW_ENABLED,
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
                onClick={() => run(onChangePrinting)}
                className={cn(ROW_BUTTON, ROW_ENABLED)}
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
                    onClick={() => run(action.onSelect)}
                    className={cn(ROW_BUTTON, ROW_ENABLED)}
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
                  onClick={() => run(() => mutations.moveToZone(value))}
                  className={cn(
                    ROW_BUTTON,
                    isCurrent ? ROW_DISABLED : ROW_ENABLED,
                  )}
                >
                  {isCurrent && (
                    <Check className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className={cn(!isCurrent && "pl-6")}>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {activeTab === "category" && (
        <ul className="flex flex-col">
          <li>
            <button
              type="button"
              disabled={isMainboardUncategorized}
              onClick={() => mutations.clearCategories()}
              className={cn(
                "w-full flex items-center gap-2 rounded-md pl-6 pr-3 min-h-9 text-sm text-left transition-colors italic",
                isMainboardUncategorized
                  ? ROW_DISABLED
                  : cn(ROW_ENABLED, "text-muted-foreground"),
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
              currentZone === "MAINBOARD" && currentCategories.includes(name);
            const isPrimary =
              currentZone === "MAINBOARD" && currentCategories[0] === name;
            return (
              <li key={name}>
                <div className="w-full flex items-center gap-2 rounded-md pl-6 pr-3 min-h-9 text-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                  <button
                    type="button"
                    onClick={() => mutations.toggleCategory(name)}
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
                      onClick={() => mutations.promoteCategory(name)}
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
  );
}
