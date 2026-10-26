"use client";

import { useEffect, useState } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  orderZoneOptions,
  useDeckCardMutations,
} from "@/app/_components/builder/card-actions-panel";
import { CardActionsMenuContent } from "@/app/_components/builder/card-actions-menu";
import { useInventoryActions } from "@/app/_components/builder/inventory-actions";
import { PrintingPicker } from "@/app/_components/builder/printing-picker";
import { resolveRowPrintingId } from "@/app/_components/builder/card-row";
import { toPreviewCard } from "@/app/_components/builder/preview-card";
import {
  useDeckPreview,
  type PreviewCard,
} from "@/app/_components/deck/deck-preview-pane";
import { toTitleCase } from "@/lib/utils";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";
import type { OwnershipState } from "@/lib/inventory/state";

interface DeckCardDetailActionsProps {
  previewCard: PreviewCard;
  deckId: string;
  cards: DeckCard[];
  subcategories: string[];
  dispatch: (action: ZoneAction) => void;
  ownershipOf: (dc: DeckCard) => OwnershipState;
}

function previewKey(card: PreviewCard): string {
  return [
    card.imageUri,
    card.backImageUri,
    card.setCode,
    card.collectorNumber,
    card.isFoil,
  ].join("|");
}

/**
 * Owner actions menu shown in the card detail modal header. Resolves the live
 * `DeckCard` by id so the menu reflects optimistic edits while open.
 */
export function DeckCardDetailActions({
  previewCard,
  cards,
  ...rest
}: DeckCardDetailActionsProps) {
  const dc = cards.find((c) => c.id === previewCard.deckCardId);
  if (!dc) return null;
  return (
    <LiveDeckCardActions
      key={dc.id}
      previewCard={previewCard}
      dc={dc}
      commanderSet={cards.some((c) => c.zone === "COMMANDER")}
      {...rest}
    />
  );
}

function LiveDeckCardActions({
  previewCard,
  dc,
  commanderSet,
  deckId,
  subcategories,
  dispatch,
  ownershipOf,
}: Omit<DeckCardDetailActionsProps, "cards"> & {
  dc: DeckCard;
  commanderSet: boolean;
}) {
  const preview = useDeckPreview();
  const [printingPickerOpen, setPrintingPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mutations = useDeckCardMutations({
    deckId,
    deckCardId: dc.id,
    currentZone: dc.zone,
    currentCategories: dc.categories,
    subcategories,
    dispatch,
  });
  const inventoryActions = useInventoryActions({
    printingId: resolveRowPrintingId(dc),
    isFoil: dc.isFoil,
    ownershipState: ownershipOf(dc),
    isPinned: dc.printingId !== null,
    sourceDeckId: deckId,
  });

  const live = toPreviewCard(dc);
  const stale = previewKey(live) !== previewKey(previewCard);
  useEffect(() => {
    if (stale) preview?.setDetailCard(live);
  });

  const zoneLabel =
    orderZoneOptions(false).find((o) => o.value === dc.zone)?.label ?? dc.zone;
  const summary = [
    `${dc.quantity}×`,
    zoneLabel,
    ...dc.categories.map(toTitleCase),
  ].join(" · ");

  function removeFromDeck() {
    mutations.remove();
    preview?.setDetailCard(null);
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Card actions"
              disabled={mutations.isPending}
              className="absolute top-2 right-10"
            />
          }
        >
          <MoreVertical aria-hidden />
        </DropdownMenuTrigger>
        <CardActionsMenuContent
          currentZone={dc.zone}
          commanderSet={commanderSet}
          currentCategories={dc.categories}
          subcategories={subcategories}
          quantity={dc.quantity}
          onQuantityChange={mutations.changeQuantity}
          mutations={mutations}
          onChangePrinting={() => setPrintingPickerOpen(true)}
          inventoryActions={inventoryActions}
          onClose={() => setMenuOpen(false)}
          header={
            <p className="px-1.5 pt-1 text-xs text-muted-foreground">
              {summary}
            </p>
          }
          extraActions={
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={removeFromDeck}
                className="gap-2"
              >
                <Trash2 className="size-3.5 shrink-0" aria-hidden />
                <span>Remove from deck</span>
              </DropdownMenuItem>
            </>
          }
        />
      </DropdownMenu>
      <PrintingPicker
        deckId={deckId}
        deckCardId={dc.id}
        cardId={dc.card.id}
        cardName={dc.card.name}
        currentPrintingId={dc.printingId ?? null}
        currentIsFoil={dc.isFoil}
        open={printingPickerOpen}
        onOpenChange={setPrintingPickerOpen}
        trigger={<span className="hidden" aria-hidden />}
      />
    </>
  );
}
