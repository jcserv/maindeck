"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { X as XIcon } from "lucide-react";
import { LegalityBadge } from "@/app/_components/card/legality-badge";
import { useDeckPreview } from "@/app/_components/deck/deck-preview-pane";
import { useDeckSearch } from "@/app/_components/builder/deck-search-context";
import { cn } from "@/lib/utils";
import {
  resolveCardBackImage,
  resolveCardImage,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";
import { getCardLegalityForDeck } from "@/lib/deck/legality";
import type { Legalities } from "@/lib/card/types-meta";
import { Format, Zone } from "@/lib/generated/prisma/enums";

export const CARD_WIDTH = 186;
export const CARD_HEIGHT = 260;
export const STACK_OFFSET = 34;

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

export function isInteractiveTargetStack(target: EventTarget | null): boolean {
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

export function useCardStackItemShared(dc: DeckCard, format: Format) {
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
      consumeScrollTo?.();
    }, 1200);
    return () => {
      window.clearTimeout(t);
      el.removeAttribute("data-search-flash");
    };
  }, [scrollToId, dc.id, consumeScrollTo]);

  const imageUri = resolveCardImage(dc);
  const backImageUri = resolveCardBackImage(dc);
  const previewPayload = {
    name: dc.card.name,
    imageUri,
    backImageUri,
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
        legalities: dc.card.legalities as Legalities,
        typeLine: dc.card.typeLine,
      },
      format,
      currentCopiesInDeck: 0,
      addingQuantity: totalCopiesByName,
    });
  }, [dc, deckCards, format]);

  return {
    preview,
    tileRef,
    isMatch,
    isNoMatch,
    imageUri,
    previewPayload,
    legality,
  };
}

function CardStackItem({
  dc,
  index,
  deckId: _deckId,
  format,
  isOwner: _isOwner,
  dispatch: _dispatch,
}: CardStackItemProps) {
  const {
    preview,
    tileRef,
    isMatch,
    isNoMatch,
    imageUri,
    previewPayload,
    legality,
  } = useCardStackItemShared(dc, format);

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
    zIndex: index,
  };

  return (
    <div
      ref={tileRef}
      style={tileStyle}
      data-search-match={isMatch ? "" : undefined}
      data-search-nomatch={isNoMatch ? "" : undefined}
      className={cn(
        "group/tile absolute left-0 rounded-md shadow-md outline-none",
        "hover:z-50 focus-within:z-50",
        isMatch && "ring-2 ring-accent",
        isNoMatch && "opacity-50",
        "data-[search-flash]:ring-2 data-[search-flash]:ring-accent",
      )}
      tabIndex={0}
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
    </div>
  );
}
