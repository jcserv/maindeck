"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BottomSheet from "@/app/_components/bottom-sheet";
import { useInventoryActions } from "@/app/_components/builder/inventory-actions";
import {
  CardActionsPanel,
  useDeckCardMutations,
} from "@/app/_components/builder/card-actions-panel";
import { CardActionsMenuContent } from "@/app/_components/builder/card-actions-menu";
import { cn } from "@/lib/utils";
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
  const { isPending } = mutations;

  const inventoryActions = useInventoryActions({
    ...(inventory ?? {
      printingId: null,
      isFoil: false,
      ownershipState: "NOT_OWNED",
      isPinned: false,
    }),
    sourceDeckId: deckId,
  });

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

  return (
    <>
      {/* Desktop */}
      <span className="hidden md:contents">
        <DropdownMenu open={desktopOpen} onOpenChange={setDesktopOpen}>
          <DropdownMenuTrigger render={triggerButton} />
          <CardActionsMenuContent
            currentZone={currentZone}
            commanderSet={commanderSet}
            currentCategories={currentCategories}
            subcategories={subcategories}
            quantity={quantity}
            onQuantityChange={onQuantityChange}
            mutations={mutations}
            onChangePrinting={onChangePrinting}
            inventoryActions={inventoryActions}
            onClose={() => setDesktopOpen(false)}
          />
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
