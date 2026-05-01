"use client";

import { useState, useTransition } from "react";
import { GripVertical, Trash2, X as XIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MoveCardMenu } from "@/app/_components/move-card-menu";
import { PrintingPicker } from "@/app/_components/printing-picker";
import { ManaCost } from "@/app/_components/mana-cost";
import {
  isInteractiveTarget,
  useCardRowShared,
  type CardRowProps,
} from "@/app/_components/card-row";
import { cn } from "@/lib/utils";
import {
  updateCardQuantity,
  removeCardFromDeck,
} from "@/lib/deck/editor-actions";

export function CardRowSortable({
  dc,
  deckId,
  format,
  subcategories,
  dispatch,
  showPrintingMeta: _showPrintingMeta,
}: Omit<CardRowProps, "isOwner">) {
  const [isPending, startTransition] = useTransition();
  const [printingPickerOpen, setPrintingPickerOpen] = useState(false);
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
    id: dc.id,
    data: { kind: "card", zone: dc.zone, category: dc.category },
  });

  const dragStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const illegalBadge = !legality.legal ? (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        aria-label={`Illegal: ${legality.reasons.join("; ")}`}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 inline-flex items-center rounded text-destructive hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <XIcon className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="font-medium mb-1.5 text-xs">Illegal in this deck</p>
        <ul className="flex flex-col gap-1 list-disc list-inside">
          {legality.reasons.map((reason) => (
            <li
              key={reason}
              className="text-xs text-muted-foreground leading-relaxed"
            >
              {reason}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  ) : null;

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

  function onRowClick(e: React.MouseEvent<HTMLLIElement>) {
    if (isInteractiveTarget(e.target)) return;
    preview?.openDetail(previewPayload, rowRef.current);
  }

  function onRowKeyDown(e: React.KeyboardEvent<HTMLLIElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      preview?.openDetail(previewPayload, rowRef.current);
    }
  }

  return (
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
        "group/row @container/row flex items-center gap-1 text-sm py-0.5 transition-all cursor-default break-inside-avoid hover:bg-accent/20 hover:ring-1 hover:ring-ring hover:rounded-sm focus-visible:outline-none focus-visible:bg-accent/20 focus-visible:ring-1 focus-visible:ring-ring focus-visible:rounded-sm",
        isPending && "opacity-50",
        searchClasses,
      )}
      onMouseEnter={() => preview?.preview(previewPayload)}
      onFocus={() => preview?.preview(previewPayload)}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
    >
      <button
        type="button"
        aria-label={`Drag ${dc.card.name}`}
        {...attributes}
        {...listeners}
        className="hidden md:inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>

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
      </div>

      {dc.card.manaCost && (
        <ManaCost
          cost={dc.card.manaCost}
          className="shrink-0 hidden @[220px]/row:inline-flex"
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
        currentSubcategory={dc.category}
        subcategories={subcategories}
        quantity={dc.quantity}
        onQuantityChange={changeQty}
        dispatch={dispatch}
        onChangePrinting={() => setPrintingPickerOpen(true)}
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
}
