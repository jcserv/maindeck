"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import Image from "next/image";
import { Minus, Plus, Trash2, X as XIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

const CARD_WIDTH = 186;
const CARD_HEIGHT = 260;
const STACK_OFFSET = 34;

interface CardStackProps {
  id?: string;
  cards: DeckCard[];
  deckId: string;
  format: Format;
  isOwner: boolean;
  dispatch: (action: ZoneAction) => void;
}

export function CardStack({
  id,
  cards,
  deckId,
  format,
  isOwner,
  dispatch,
}: CardStackProps) {
  if (cards.length === 0) return null;
  const stackHeight = (cards.length - 1) * STACK_OFFSET + CARD_HEIGHT;

  return (
    <div
      id={id}
      className="relative"
      style={{ width: CARD_WIDTH, height: stackHeight }}
    >
      {cards.map((dc, index) => (
        <CardStackItem
          key={dc.id}
          dc={dc}
          index={index}
          deckId={deckId}
          format={format}
          isOwner={isOwner}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "button, a, [role='button'], [role='menuitem'], input, textarea",
  );
}

interface CardStackItemProps {
  dc: DeckCard;
  index: number;
  deckId: string;
  format: Format;
  isOwner: boolean;
  dispatch: (action: ZoneAction) => void;
}

function CardStackItem({
  dc,
  index,
  deckId,
  format,
  isOwner,
  dispatch,
}: CardStackItemProps) {
  const [isPending, startTransition] = useTransition();
  const preview = useDeckPreview();
  const tileRef = useRef<HTMLDivElement | null>(null);
  const search = useDeckSearch();

  const searchActive = !!search && search.query.trim().length > 0;
  const isMatch = searchActive && search!.matchIds.has(dc.id);
  const isNoMatch = searchActive && !isMatch;

  const scrollToId = search?.scrollToId ?? null;
  const consumeScrollTo = search?.consumeScrollTo;
  useEffect(() => {
    if (scrollToId !== dc.id) return;
    const el = tileRef.current;
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

  const imageUri = resolveCardImage(dc);
  const previewPayload = {
    name: dc.card.name,
    imageUri,
    manaCost: dc.card.manaCost ?? null,
    typeLine: dc.card.typeLine ?? null,
    oracleText: dc.card.oracleText ?? null,
    setCode: dc.printing?.setCode ?? null,
    collectorNumber: dc.printing?.collectorNumber ?? null,
    isFoil: dc.isFoil,
  };

  const deckCards = search?.meta.cards;
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
      },
      format,
      currentCopiesInDeck: 0,
      addingQuantity: totalCopiesByName,
    });
  }, [dc, deckCards, format]);

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

  function onTileClick(e: React.MouseEvent<HTMLDivElement>) {
    if (isInteractiveTarget(e.target)) return;
    preview?.openDetail(previewPayload, tileRef.current);
  }

  function onTileKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      preview?.openDetail(previewPayload, tileRef.current);
    }
  }

  const dragHandlers = isOwner ? { ...attributes, ...listeners } : {};

  const tileStyle: React.CSSProperties = {
    top: index * STACK_OFFSET,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isPending ? 0.5 : undefined,
    zIndex: isDragging ? 60 : index,
  };

  return (
    <div
      ref={(node) => {
        tileRef.current = node;
        setNodeRef(node);
      }}
      style={tileStyle}
      data-search-match={isMatch ? "" : undefined}
      data-search-nomatch={isNoMatch ? "" : undefined}
      className={cn(
        "group/tile absolute left-0 rounded-md shadow-md outline-none",
        "hover:z-50 focus-within:z-50",
        isOwner && "cursor-grab active:cursor-grabbing",
        isMatch && "ring-2 ring-accent",
        isNoMatch && "opacity-50",
        "data-[search-flash]:ring-2 data-[search-flash]:ring-accent",
      )}
      tabIndex={0}
      {...dragHandlers}
      onMouseEnter={() => preview?.preview(previewPayload)}
      onFocus={() => preview?.preview(previewPayload)}
      onClick={onTileClick}
      onKeyDown={onTileKeyDown}
      aria-label={`${dc.card.name} ×${dc.quantity}`}
    >
      {imageUri ? (
        <Image
          src={imageUri}
          alt={dc.card.name}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          quality={70}
          loading={index < 3 ? "eager" : "lazy"}
          draggable={false}
          className="rounded-md select-none pointer-events-none"
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-md bg-muted text-xs text-muted-foreground px-2 text-center"
          style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
        >
          {dc.card.name}
        </div>
      )}

      <span
        className="absolute top-1 left-1 rounded-full bg-black/70 text-white text-[11px] font-mono tabular-nums px-1.5 py-0.5 shadow-sm pointer-events-none"
        aria-hidden
      >
        ×{dc.quantity}
      </span>

      {!legality.legal && (
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={100}
            aria-label={`Illegal: ${legality.reasons.join("; ")}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-1 right-1 inline-flex items-center justify-center size-5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow-sm"
          >
            <XIcon className="size-3" aria-hidden />
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
      )}

      {isOwner && (
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-1 px-1.5 py-1 rounded-b-md bg-black/65 opacity-0 group-hover/tile:opacity-100 focus-within:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label={`Remove one ${dc.card.name}`}
            disabled={isPending}
            onClick={() => changeQty(dc.quantity - 1)}
            className="size-7 text-white hover:bg-white/15 hover:text-white"
          >
            <Minus aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label={`Add one ${dc.card.name}`}
            disabled={isPending}
            onClick={() => changeQty(dc.quantity + 1)}
            className="size-7 text-white hover:bg-white/15 hover:text-white"
          >
            <Plus aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label={`Remove ${dc.card.name} from deck`}
            disabled={isPending}
            onClick={remove}
            className="size-7 text-white hover:bg-white/15 hover:text-destructive"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
