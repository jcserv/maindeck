"use client";

import { startTransition, useOptimistic } from "react";
import { Bookmark, Check, CheckCircle2, Circle } from "lucide-react";
import { setHolding, setWishlist } from "@/app/_actions/inventory";
import { cn } from "@/lib/utils";
import type { OwnershipState, PartialReason } from "@/lib/inventory/state";

interface OwnershipBadgeProps {
  state: OwnershipState;
  printingId: number;
  isFoil: boolean;
  partialReason?: PartialReason | undefined;
}

const ARIA_LABELS: Record<OwnershipState, string> = {
  NOT_OWNED: "Not owned. Click to mark as owned.",
  PARTIAL: "Partially owned. Click to mark this printing as owned.",
  OWNED: "Owned. Click to clear.",
  WISHLIST: "On wishlist. Click to mark as owned.",
};

export function OwnershipBadge({
  state,
  printingId,
  isFoil,
}: OwnershipBadgeProps) {
  const [optimisticState, setOptimisticState] = useOptimistic<
    OwnershipState,
    OwnershipState
  >(state, (_curr, next) => next);

  function handleToggle(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const next: OwnershipState =
      optimisticState === "OWNED" ? "NOT_OWNED" : "OWNED";
    startTransition(async () => {
      setOptimisticState(next);
      if (next === "OWNED") {
        await setHolding(printingId, isFoil, 1);
      } else {
        await setHolding(printingId, isFoil, 0);
        await setWishlist(printingId, isFoil, false);
      }
    });
  }

  const icon = (() => {
    if (optimisticState === "NOT_OWNED") {
      return (
        <Circle
          className="size-3.5 text-muted-foreground/50 hover:text-emerald-500"
          strokeWidth={1.5}
          aria-hidden
        />
      );
    }
    if (optimisticState === "PARTIAL") {
      return (
        <Check
          className="size-3.5 text-muted-foreground hover:text-emerald-500"
          strokeWidth={1.5}
          aria-hidden
        />
      );
    }
    if (optimisticState === "OWNED") {
      return (
        <CheckCircle2
          className="size-3.5 text-emerald-500 hover:text-muted-foreground/50"
          aria-hidden
        />
      );
    }
    return (
      <Bookmark
        className="size-3.5 text-amber-500 hover:text-emerald-500"
        aria-hidden
      />
    );
  })();

  return (
    <button
      type="button"
      aria-label={ARIA_LABELS[optimisticState]}
      title={ARIA_LABELS[optimisticState]}
      onClick={handleToggle}
      className={cn(
        "shrink-0 inline-flex items-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      {icon}
    </button>
  );
}
