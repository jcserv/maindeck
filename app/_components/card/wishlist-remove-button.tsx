"use client";

import { startTransition } from "react";
import { Trash2 } from "lucide-react";
import { setWishlist } from "@/app/_actions/inventory";
import { cn } from "@/lib/utils";

interface WishlistRemoveButtonProps {
  printingId: number;
  isFoil: boolean;
  onRemoved: () => void;
}

export function WishlistRemoveButton({
  printingId,
  isFoil,
  onRemoved,
}: WishlistRemoveButtonProps) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      onRemoved();
      await setWishlist(printingId, isFoil, false);
    });
  }

  return (
    <button
      type="button"
      aria-label="Remove from wishlist"
      title="Remove from wishlist"
      onClick={handleClick}
      className={cn(
        "absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center rounded-md size-7 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}
