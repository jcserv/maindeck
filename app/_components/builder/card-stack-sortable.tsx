"use client";

import { useTransition } from "react";
import Image from "next/image";
import { Minus, Plus, Trash2, X as XIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { GameChangerChip } from "@/app/_components/builder/card-row";
import { LegalityBadge } from "@/app/_components/card/legality-badge";
import {
  useCardStackItemShared,
  isInteractiveTargetStack,
  CARD_WIDTH,
  CARD_HEIGHT,
  STACK_OFFSET,
} from "@/app/_components/builder/card-stack";
import {
  updateCardQuantity,
  removeCardFromDeck,
} from "@/lib/deck/editor-actions";
import { cn } from "@/lib/utils";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";
import type { Format } from "@/lib/generated/prisma/enums";

interface CardStackSortableProps {
  id?: string;
  cards: DeckCard[];
  deckId: string;
  format: Format;
  dispatch: (action: ZoneAction) => void;
}

export function CardStackSortable({
  id,
  cards,
  deckId,
  format,
  dispatch,
}: CardStackSortableProps) {
  if (cards.length === 0) return null;
  const stackHeight = (cards.length - 1) * STACK_OFFSET + CARD_HEIGHT;

  return (
    <div
      id={id}
      className="relative"
      style={{ width: CARD_WIDTH, height: stackHeight }}
    >
      {cards.map((dc, index) => (
        <CardStackItemSortable
          key={dc.id}
          dc={dc}
          index={index}
          deckId={deckId}
          format={format}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

interface CardStackItemSortableProps {
  dc: DeckCard;
  index: number;
  deckId: string;
  format: Format;
  dispatch: (action: ZoneAction) => void;
}

function CardStackItemSortable({
  dc,
  index,
  deckId,
  format,
  dispatch,
}: CardStackItemSortableProps) {
  const [isPending, startTransition] = useTransition();
  const {
    preview,
    tileRef,
    isMatch,
    isNoMatch,
    imageUri,
    previewPayload,
    legality,
  } = useCardStackItemShared(dc, format);

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
    if (isInteractiveTargetStack(e.target)) return;
    preview?.openDetail(previewPayload, tileRef.current);
  }

  function onTileKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      preview?.openDetail(previewPayload, tileRef.current);
    }
  }

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
        "cursor-grab active:cursor-grabbing",
        isMatch && "ring-2 ring-accent",
        isNoMatch && "opacity-50",
        "data-[search-flash]:ring-2 data-[search-flash]:ring-accent",
      )}
      {...attributes}
      {...listeners}
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
        <LegalityBadge
          reasons={legality.reasons}
          triggerClassName="absolute top-1 right-1 inline-flex items-center justify-center size-5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow-sm"
          triggerIcon={<XIcon className="size-3" aria-hidden />}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}

      <GameChangerChip
        format={format}
        gameChanger={dc.card.gameChanger}
        className="absolute bottom-1 left-1 shadow-sm pointer-events-none"
      />

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
    </div>
  );
}
