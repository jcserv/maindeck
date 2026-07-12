"use client";

import { useState, useTransition } from "react";
import { GripVertical, Trash2, X as XIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { LegalityBadge } from "@/app/_components/card/legality-badge";
import { MoveCardMenu } from "@/app/_components/builder/move-card-menu";
import { PrintingPicker } from "@/app/_components/builder/printing-picker";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { OwnershipBadge } from "@/app/_components/card/ownership-badge";
import {
  formatPriceLabel,
  GameChangerChip,
  isInteractiveTarget,
  resolveRowPrintingId,
  useCardRowShared,
  type CardRowProps,
} from "@/app/_components/builder/card-row";
import { DEFAULT_DECK_VIEW_OPTIONS } from "@/app/_components/builder/decklist-view-options";
import {
  type PreviewCard,
  useDeckPreview,
} from "@/app/_components/deck/deck-preview-pane";
import { cn } from "@/lib/utils";
import {
  updateCardQuantity,
  removeCardFromDeck,
} from "@/lib/deck/editor-actions";
import { moveCardTo } from "@/app/_actions/deck/categories";
import type { Zone } from "@/lib/generated/prisma/enums";

const ROW_ZONE_BY_KEY: Record<string, Zone> = {
  "1": "COMMANDER",
  "2": "MAINBOARD",
  "3": "SIDEBOARD",
  "4": "CONSIDERING",
  "5": "COMPANION",
};

function shouldIgnoreRowKeyEvent(e: React.KeyboardEvent<HTMLLIElement>): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;

  // Ignore if target is not the row root and is an interactive/focusable element
  if (target !== e.currentTarget) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    if (target.hasAttribute("tabindex")) return true;
    const role = target.getAttribute("role");
    if (role === "button" || role === "menuitem") return true;
  }

  return false;
}

function handleRowKeyDown(
  e: React.KeyboardEvent<HTMLLIElement>,
  opts: {
    dc: { quantity: number; zone: Zone };
    preview: ReturnType<typeof useDeckPreview>;
    previewPayload: PreviewCard;
    rowRef: React.RefObject<HTMLElement | null>;
    changeQty: (n: number) => void;
    moveToZone: (z: Zone) => void;
    remove: () => void;
    setPrintingPickerOpen: (v: boolean) => void;
  },
) {
  if (shouldIgnoreRowKeyEvent(e)) return;

  if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
    e.preventDefault();
    opts.preview?.openDetail(opts.previewPayload, opts.rowRef.current);
    return;
  }

  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    opts.changeQty(opts.dc.quantity + 1);
    return;
  }
  if (e.key === "-") {
    if (opts.dc.quantity <= 1) return;
    e.preventDefault();
    opts.changeQty(opts.dc.quantity - 1);
    return;
  }

  const zone = ROW_ZONE_BY_KEY[e.key];
  if (zone) {
    if (zone === opts.dc.zone) return;
    e.preventDefault();
    opts.moveToZone(zone);
    return;
  }

  if (e.key === "p" || e.key === "P") {
    e.preventDefault();
    opts.setPrintingPickerOpen(true);
    return;
  }

  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    opts.remove();
  }
}

export function CardRowSortable({
  dc,
  deckId,
  format,
  subcategories,
  commanderSet = false,
  dispatch,
  showPrintingMeta: _showPrintingMeta,
  viewerId,
  ownership,
  viewOptions = DEFAULT_DECK_VIEW_OPTIONS,
  sortableId,
}: Omit<CardRowProps, "isOwner"> & { sortableId?: string }) {
  const [isPending, startTransition] = useTransition();
  const [printingPickerOpen, setPrintingPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { preview, rowRef, searchClasses, searchAttrs, previewPayload, legality } =
    useCardRowShared(dc, format);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId ?? dc.id,
    // Ghost (secondary-membership) entries are display-only: not draggable.
    disabled: dc.isSecondary ?? false,
    data: { kind: "card", zone: dc.zone, category: dc.categories[0] ?? null },
  });

  const dragStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const illegalBadge = !legality.legal ? (
    <LegalityBadge
      reasons={legality.reasons}
      triggerClassName="shrink-0 inline-flex items-center rounded text-destructive hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      triggerIcon={<XIcon className="size-3.5" aria-hidden />}
    />
  ) : null;

  const ownershipBadgePrintingId = resolveRowPrintingId(dc);
  const showOwnership =
    !!viewerId &&
    viewOptions.ownership &&
    ownership &&
    ownershipBadgePrintingId !== null;
  const priceLabel = formatPriceLabel(dc);
  const showPrice = viewOptions.price && priceLabel !== null;

  function changeQty(next: number) {
    startTransition(async () => {
      dispatch({ type: "update", deckCardId: dc.id, quantity: next });
      await updateCardQuantity(deckId, dc.id, next);
    });
  }

  function remove() {
    startTransition(async () => {
      dispatch({ type: "remove", deckCardId: dc.id });
      await removeCardFromDeck(deckId, dc.id);
    });
  }

  function moveToZone(nextZone: Zone) {
    if (nextZone === dc.zone) return;
    startTransition(async () => {
      dispatch({
        type: "move",
        deckCardId: dc.id,
        zone: nextZone,
        categories: [],
      });
      await moveCardTo(deckId, dc.id, nextZone, null);
    });
  }

  function onRowClick(e: React.MouseEvent<HTMLLIElement>) {
    if (isInteractiveTarget(e.target)) return;
    preview?.openDetail(previewPayload, rowRef.current);
  }

  function onRowKeyDown(e: React.KeyboardEvent<HTMLLIElement>) {
    handleRowKeyDown(e, { dc, preview, previewPayload, rowRef, changeQty, moveToZone, remove, setPrintingPickerOpen });
  }

  const li = (
    <li
      ref={(node) => {
        rowRef.current = node;
        setNodeRef(node);
      }}
      style={dragStyle}
      {...searchAttrs}
      data-deck-row
      tabIndex={-1}
      className={cn(
        "group/row @container/row flex items-center gap-1 text-sm py-0.5 cursor-default break-inside-avoid hover:bg-accent/20 hover:ring-1 hover:ring-ring hover:rounded-sm focus-visible:outline-none focus-visible:bg-accent/20 focus-visible:ring-1 focus-visible:ring-ring focus-visible:rounded-sm",
        isPending && "opacity-50",
        dc.isSecondary && "opacity-50",
        searchClasses,
      )}
      onMouseEnter={() => preview?.preview(previewPayload)}
      onFocus={() => preview?.preview(previewPayload)}
      onClick={onRowClick}
      onContextMenu={(e) => {
        if (!viewerId) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
      onKeyDown={onRowKeyDown}
    >
      {dc.isSecondary ? (
        <span className="hidden md:inline-flex size-5 shrink-0" aria-hidden />
      ) : (
        <button
          type="button"
          aria-label={`Drag ${dc.card.name}`}
          {...attributes}
          {...listeners}
          className="hidden md:inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      )}

      <span
        className="w-5 text-right text-muted-foreground font-mono text-xs tabular-nums shrink-0 select-none"
        aria-label={`Quantity: ${dc.quantity}`}
      >
        {dc.quantity}
      </span>

      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => preview?.openDetail(previewPayload, rowRef.current)}
          className="min-w-0 truncate text-left hover:underline"
        >
          {dc.card.name}
        </button>
        {illegalBadge}
        <GameChangerChip format={format} gameChanger={dc.card.gameChanger} />
      </div>

      {viewOptions.manaValues && dc.card.manaCost && (
        <ManaCost
          cost={dc.card.manaCost}
          className="shrink-0 hidden @[220px]/row:inline-flex"
        />
      )}

      {showPrice && (
        <span className="shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
          {priceLabel}
        </span>
      )}

      {showOwnership && ownership && (
        <OwnershipBadge
          state={ownership.state}
          printingId={ownershipBadgePrintingId!}
          isFoil={dc.isFoil}
          partialReason={ownership.partialReason}
        />
      )}

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

      <MoveCardMenu
        deckId={deckId}
        deckCardId={dc.id}
        cardName={dc.card.name}
        currentZone={dc.zone}
        commanderSet={commanderSet}
        currentCategories={dc.categories}
        subcategories={subcategories}
        quantity={dc.quantity}
        onQuantityChange={changeQty}
        dispatch={dispatch}
        onChangePrinting={() => setPrintingPickerOpen(true)}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        inventory={{
          printingId: ownershipBadgePrintingId,
          isFoil: dc.isFoil,
          ownershipState: ownership?.state ?? "NOT_OWNED",
          isPinned: dc.printingId !== null,
        }}
      />

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${dc.card.name} from deck`}
        disabled={isPending}
        onClick={remove}
        className="size-11 shrink-0 md:size-7 text-muted-foreground hover:text-destructive"
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );

  return li;
}
