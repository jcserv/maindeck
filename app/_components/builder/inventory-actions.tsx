"use client";

import { useTransition, type ReactNode } from "react";
import { Bookmark, CheckCircle2, Eraser } from "lucide-react";
import { setHolding, setWishlist } from "@/app/_actions/inventory";
import type { OwnershipState } from "@/lib/inventory/state";

interface InventoryAction {
  key: "owned" | "wishlist" | "clear";
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface UseInventoryActionsOptions {
  printingId: number | null;
  isFoil: boolean;
  ownershipState: OwnershipState;
  isPinned: boolean;
  /**
   * Deck the card is being wishlisted from. When set, a new wishlist entry is
   * filed under a category named after this deck. Omit for non-deck contexts.
   */
  sourceDeckId?: string | undefined;
}

/**
 * Single source of truth for the three inventory actions (Mark owned / Mark
 * wishlist / Clear ownership), mapped over by both the owner `MoveCardMenu` and
 * the non-owner `InventoryMenu`. Returns `[]` when there's no printing to act on.
 */
export function useInventoryActions({
  printingId,
  isFoil,
  ownershipState,
  isPinned,
  sourceDeckId,
}: UseInventoryActionsOptions): InventoryAction[] {
  const [, startTransition] = useTransition();
  if (printingId === null) return [];

  const suffix = isPinned ? "(this printing)" : "(default printing)";
  const actions: InventoryAction[] = [];

  if (ownershipState !== "OWNED") {
    actions.push({
      key: "owned",
      label: `Mark as owned ${suffix}`,
      icon: <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />,
      onSelect: () =>
        startTransition(async () => {
          await setHolding(printingId, isFoil, 1);
        }),
    });
  }

  if (ownershipState !== "WISHLIST") {
    actions.push({
      key: "wishlist",
      label: `Mark as wishlist ${suffix}`,
      icon: <Bookmark className="size-3.5 text-amber-500" aria-hidden />,
      onSelect: () =>
        startTransition(async () => {
          await setWishlist(printingId, isFoil, true, sourceDeckId);
        }),
    });
  }

  if (ownershipState !== "NOT_OWNED") {
    actions.push({
      key: "clear",
      label: `Clear ownership ${suffix}`,
      icon: <Eraser className="size-3.5" aria-hidden />,
      onSelect: () =>
        startTransition(async () => {
          await setHolding(printingId, isFoil, 0);
          await setWishlist(printingId, isFoil, false);
        }),
    });
  }

  return actions;
}
