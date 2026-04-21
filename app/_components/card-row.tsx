"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import { Eye, GripVertical, Minus, Plus, Trash2, X as XIcon } from "lucide-react";
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
import { useDeckPreview } from "@/app/_components/deck-preview-pane";
import { useDeckSearch } from "@/app/_components/deck-search-context";
import {
  updateCardQuantity,
  removeCardFromDeck,
} from "@/lib/deck/editor-actions";
import { cn } from "@/lib/utils";
import {
  resolveCardImage,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";
import { getCardLegalityForDeck } from "@/lib/deck/legality";
import { Format, Zone } from "@/lib/generated/prisma/enums";

interface CardRowProps {
  dc: DeckCard;
  deckId: string;
  format: Format;
  subcategories: string[];
  isOwner: boolean;
  dispatch: (action: ZoneAction) => void;
  /** When false, the non-owner row omits the printing set code. Defaults to true. */
  showPrintingMeta?: boolean;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("button, a, [role='button'], [role='menuitem'], input, textarea");
}

export function CardRow({
  dc,
  deckId,
  format,
  subcategories,
  isOwner,
  dispatch,
  showPrintingMeta = true,
}: CardRowProps) {
  const [isPending, startTransition] = useTransition();
  const preview = useDeckPreview();
  const rowRef = useRef<HTMLLIElement>(null);
  const search = useDeckSearch();

  const searchActive = !!search && search.query.trim().length > 0;
  const isMatch = searchActive && search!.matchIds.has(dc.id);
  const isNoMatch = searchActive && !isMatch;

  const scrollToId = search?.scrollToId ?? null;
  const consumeScrollTo = search?.consumeScrollTo;
  useEffect(() => {
    if (scrollToId !== dc.id) return;
    const el = rowRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.setAttribute("data-search-flash", "");
    const t = window.setTimeout(() => {
      el.removeAttribute("data-search-flash");
    }, 1200);
    consumeScrollTo?.();
    return () => {
      window.clearTimeout(t);
      el.removeAttribute("data-search-flash");
    };
  }, [scrollToId, dc.id, consumeScrollTo]);

  const searchClasses = cn(
    isMatch && "bg-accent/30 ring-1 ring-accent rounded-sm",
    isNoMatch && "opacity-50",
    "data-[search-flash]:bg-accent/60 data-[search-flash]:ring-2 data-[search-flash]:ring-accent data-[search-flash]:rounded-sm",
  );
  const searchAttrs = {
    "data-search-match": isMatch ? "" : undefined,
    "data-search-nomatch": isNoMatch ? "" : undefined,
  } as const;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dc.id,
    disabled: !isOwner,
    data: { kind: "card", zone: dc.zone, category: dc.category },
  });

  const previewPayload = {
    name: dc.card.name,
    imageUri: resolveCardImage(dc),
    manaCost: dc.card.manaCost ?? null,
    typeLine: dc.card.typeLine ?? null,
    oracleText: dc.card.oracleText ?? null,
    setCode: dc.printing?.setCode ?? null,
    collectorNumber: dc.printing?.collectorNumber ?? null,
    isFoil: dc.isFoil,
  };

  const dragStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const deckCards = search?.meta.cards;
  const commanderIdentity = useMemo(() => {
    const set = new Set<string>();
    for (const c of deckCards ?? []) {
      if (c.zone === Zone.COMMANDER) {
        for (const x of c.card.colorIdentity ?? []) set.add(x);
      }
    }
    return [...set];
  }, [deckCards]);

  const legality = useMemo(() => {
    const checkable = dc.zone === Zone.MAINBOARD || dc.zone === Zone.COMMANDER;
    if (!checkable || !dc.card.legalities) {
      return { legal: true, reasons: [] as string[] };
    }
    const totalCopiesByName = (deckCards ?? [dc])
      .filter(
        (c) =>
          c.card.name === dc.card.name &&
          (c.zone === Zone.MAINBOARD || c.zone === Zone.COMMANDER),
      )
      .reduce((s, c) => s + c.quantity, 0);
    return getCardLegalityForDeck({
      card: {
        name: dc.card.name,
        legalities: dc.card.legalities as Record<string, string>,
        typeLine: dc.card.typeLine,
        colorIdentity: dc.card.colorIdentity,
      },
      format,
      currentCopiesInDeck: 0,
      addingQuantity: totalCopiesByName,
      commanderIdentity,
    });
  }, [dc, deckCards, format, commanderIdentity]);

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
        <p className="font-medium mb-1.5 text-xs">
          Illegal in this deck
        </p>
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

  if (!isOwner) {
    return (
      <li
        ref={rowRef}
        {...searchAttrs}
        data-deck-row
        className={cn(
          "@container/row flex items-center gap-1 text-sm py-0.5 cursor-default break-inside-avoid transition-colors hover:bg-accent/20 hover:ring-1 hover:ring-ring hover:rounded-sm focus-visible:outline-none focus-visible:bg-accent/20 focus-visible:ring-1 focus-visible:ring-ring focus-visible:rounded-sm",
          searchClasses,
        )}
        tabIndex={0}
        onMouseEnter={() => preview?.preview(previewPayload)}
        onFocus={() => preview?.preview(previewPayload)}
        onClick={onRowClick}
        onKeyDown={onRowKeyDown}
      >
        <span className="w-5 text-right text-muted-foreground font-mono text-xs tabular-nums shrink-0">
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
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Preview ${dc.card.name}`}
          type="button"
          onClick={() => preview?.openSheet(previewPayload)}
          className="size-11 shrink-0 md:hidden text-muted-foreground"
        >
          <Eye aria-hidden />
        </Button>
        {dc.card.manaCost && (
          <ManaCost
            cost={dc.card.manaCost}
            className="shrink-0 hidden @[220px]/row:inline-flex"
          />
        )}
        {showPrintingMeta && dc.printing && (
          <span className="shrink-0 hidden @[320px]/row:inline-flex text-xs text-muted-foreground font-mono">
            {dc.printing.setCode.toUpperCase()} #{dc.printing.collectorNumber}
            {dc.isFoil ? " ✦" : ""}
          </span>
        )}
      </li>
    );
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

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove one ${dc.card.name}`}
        disabled={isPending}
        onClick={() => changeQty(dc.quantity - 1)}
        className="size-11 shrink-0 md:size-7"
      >
        <Minus aria-hidden />
      </Button>

      <span
        className="w-5 text-center text-muted-foreground font-mono text-xs tabular-nums select-none"
        aria-label={`Quantity: ${dc.quantity}`}
      >
        {dc.quantity}
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Add one ${dc.card.name}`}
        disabled={isPending}
        onClick={() => changeQty(dc.quantity + 1)}
        className="size-11 shrink-0 md:size-7"
      >
        <Plus aria-hidden />
      </Button>

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

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Preview ${dc.card.name}`}
        type="button"
        onClick={() => preview?.openSheet(previewPayload)}
        className="size-11 shrink-0 md:hidden text-muted-foreground"
      >
        <Eye aria-hidden />
      </Button>

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
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 hidden @[340px]/row:flex h-7 px-2 text-xs text-muted-foreground font-mono gap-1"
            aria-label={`Change printing for ${dc.card.name}`}
            type="button"
          >
            {dc.printing
              ? `${dc.printing.setCode.toUpperCase()} #${dc.printing.collectorNumber}${dc.isFoil ? " ✦" : ""}`
              : "set"}
          </Button>
        }
      />

      <MoveCardMenu
        deckId={deckId}
        deckCardId={dc.id}
        currentZone={dc.zone}
        currentSubcategory={dc.category}
        subcategories={subcategories}
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
