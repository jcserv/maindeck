"use client";

import { useTransition } from "react";
import { Bookmark, Check, CheckCircle2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { setHolding, setWishlist } from "@/app/_actions/inventory";
import { cn } from "@/lib/utils";
import type {
  OwnershipState,
  PartialReason,
} from "@/lib/inventory/state";

interface OwnershipBadgeProps {
  state: Exclude<OwnershipState, "NOT_OWNED">;
  printingId: number;
  isFoil: boolean;
  partialReason?: PartialReason | undefined;
}

const STATE_LABELS: Record<Exclude<OwnershipState, "NOT_OWNED">, string> = {
  PARTIAL: "Partial",
  OWNED: "Owned",
  WISHLIST: "Wishlist",
};

const STATE_EXPLANATIONS: Record<Exclude<OwnershipState, "NOT_OWNED">, string> =
  {
    PARTIAL: "You own a copy, but not this exact printing or finish.",
    OWNED: "You own this exact printing and finish.",
    WISHLIST: "You've marked this printing to acquire.",
  };

function partialReasonText(reason: PartialReason | undefined, isFoil: boolean) {
  if (reason === "foil-mismatch") {
    return isFoil
      ? "You own a non-foil version of this printing — foils are tracked separately."
      : "You own the foil version of this printing — foils are tracked separately.";
  }
  if (reason === "different-printing") {
    return "You own a different printing of this card.";
  }
  return null;
}

export function OwnershipBadge({
  state,
  printingId,
  isFoil,
  partialReason,
}: OwnershipBadgeProps) {
  const [isPending, startTransition] = useTransition();

  const trigger = (() => {
    if (state === "PARTIAL") {
      return (
        <Check
          className="size-3.5 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
      );
    }
    if (state === "OWNED") {
      return <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />;
    }
    return <Bookmark className="size-3.5 text-amber-500" aria-hidden />;
  })();

  const label = STATE_LABELS[state];
  const reasonText = partialReasonText(partialReason, isFoil);

  function handleSetOwned() {
    startTransition(async () => {
      await setHolding(printingId, isFoil, 1);
    });
  }

  function handleSetWishlist() {
    startTransition(async () => {
      await setWishlist(printingId, isFoil, true);
    });
  }

  function handleClear() {
    startTransition(async () => {
      await setHolding(printingId, isFoil, 0);
      await setWishlist(printingId, isFoil, false);
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        aria-label={`Ownership: ${label}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "shrink-0 inline-flex items-center gap-1 rounded text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        {trigger}
        <span
          className={cn(
            "hidden @[220px]/row:inline text-[10px] uppercase tracking-wide",
            state === "OWNED" && "text-emerald-500",
            state === "WISHLIST" && "text-amber-500",
            state === "PARTIAL" && "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="font-medium mb-1 text-xs">{label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {STATE_EXPLANATIONS[state]}
        </p>
        {reasonText && (
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {reasonText}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          {state === "WISHLIST" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={isPending}
              onClick={handleSetOwned}
            >
              Mark as owned
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={isPending}
              onClick={handleSetWishlist}
            >
              Move to wishlist
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={isPending}
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
