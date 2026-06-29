"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BottomSheet from "@/app/_components/bottom-sheet";
import { useInventoryActions } from "@/app/_components/builder/inventory-actions";
import type { OwnershipState } from "@/lib/inventory/state";

interface InventoryMenuProps {
  printingId: number | null;
  isFoil: boolean;
  ownershipState: OwnershipState;
  isPinned: boolean;
  cardName: string;
  /** Deck the card is wishlisted from; categorizes new wishlist entries by deck name. */
  sourceDeckId?: string;
  /** Controls the desktop dropdown (e.g. opened by row right-click). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Compact ⋮ menu for non-owner rows: inventory actions only. Mirrors the
 * desktop dropdown + mobile bottom sheet plumbing of `MoveCardMenu` — the
 * controlled `open` drives only the desktop dropdown; the mobile sheet keeps
 * its own state so the two never open at once. Renders nothing when there are
 * no actions (e.g. no printing to act on).
 */
export function InventoryMenu({
  printingId,
  isFoil,
  ownershipState,
  isPinned,
  cardName,
  sourceDeckId,
  open,
  onOpenChange,
}: InventoryMenuProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const actions = useInventoryActions({
    printingId,
    isFoil,
    ownershipState,
    isPinned,
    sourceDeckId,
  });

  if (actions.length === 0) return null;

  const triggerButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Inventory actions"
      className="size-11 shrink-0 md:size-7 text-muted-foreground"
    >
      <MoreVertical className="size-3.5" aria-hidden />
    </Button>
  );

  return (
    <>
      {/* Desktop */}
      <span className="hidden md:contents">
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
          <DropdownMenuTrigger render={triggerButton} />
          <DropdownMenuContent align="end" side="bottom" className="w-56">
            <DropdownMenuGroup>
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.key}
                  onClick={action.onSelect}
                  className="gap-2"
                >
                  {action.icon}
                  <span>{action.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      {/* Mobile */}
      <span className="contents md:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Inventory actions"
          onClick={() => setSheetOpen(true)}
          className="size-11 shrink-0 text-muted-foreground"
        >
          <MoreVertical className="size-3.5" aria-hidden />
        </Button>

        <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title={cardName}>
          <ul className="flex flex-col pt-1">
            {actions.map((action) => (
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
          </ul>
        </BottomSheet>
      </span>
    </>
  );
}
