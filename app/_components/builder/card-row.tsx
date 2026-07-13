"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X as XIcon } from "lucide-react";
import { LegalityBadge } from "@/app/_components/card/legality-badge";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { OwnershipBadge } from "@/app/_components/card/ownership-badge";
import { InventoryMenu } from "@/app/_components/builder/inventory-menu";
import { Chip } from "@/components/ui/chip";
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
import type { OwnershipResolution } from "@/lib/inventory/state";
import {
  DEFAULT_DECK_VIEW_OPTIONS,
  type DeckViewOptions,
} from "@/app/_components/builder/decklist-view-options";
import { Format, Zone } from "@/lib/generated/prisma/enums";

export interface CardRowProps {
  dc: DeckCard;
  deckId: string;
  format: Format;
  subcategories: string[];
  /** Whether the deck already has a commander; demotes the Commander move option. */
  commanderSet?: boolean;
  isOwner: boolean;
  dispatch: (action: ZoneAction) => void;
  /** When false, the non-owner row omits the printing set code. Defaults to true. */
  showPrintingMeta?: boolean;
  viewerId?: string | undefined;
  ownership?: OwnershipResolution | undefined;
  viewOptions?: DeckViewOptions | undefined;
}

/** Resolves the printingId for inventory actions, falling back to canonical first printing when unpinned. */
export function resolveRowPrintingId(dc: DeckCard): number | null {
  if (dc.printingId !== null) return dc.printingId;
  const first = dc.card.printings[0] as { id?: number } | undefined;
  return first?.id ?? null;
}

export function formatPriceLabel(dc: DeckCard): string | null {
  const pinned = dc.printing as
    | { priceUsd?: number | null; priceUsdFoil?: number | null }
    | null
    | undefined;
  const canonical = dc.card.printings[0] as
    | { priceUsd?: number | null; priceUsdFoil?: number | null }
    | undefined;
  const source = pinned ?? canonical;
  if (!source) return null;
  const primary = dc.isFoil ? source.priceUsdFoil : source.priceUsd;
  const fallback = dc.isFoil ? source.priceUsd : source.priceUsdFoil;
  const price = primary ?? fallback;
  if (price === null || price === undefined) return null;
  return `$${price.toFixed(2)}`;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "button, a, [role='button'], [role='menuitem'], input, textarea",
  );
}

export function useCardRowShared(dc: DeckCard, format: Format) {
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
      consumeScrollTo?.();
    }, 1200);
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
        legalities: dc.card.legalities as Legalities,
        typeLine: dc.card.typeLine,
        colorIdentity: dc.card.colorIdentity,
      },
      format,
      currentCopiesInDeck: 0,
      addingQuantity: totalCopiesByName,
      commanderIdentity,
    });
  }, [dc, deckCards, format, commanderIdentity]);

  return {
    preview,
    rowRef,
    searchClasses,
    searchAttrs,
    previewPayload,
    legality,
  };
}

export function GameChangerChip({
  format,
  gameChanger,
  className,
}: {
  format: Format;
  gameChanger: boolean;
  className?: string;
}) {
  if (format !== "COMMANDER" || !gameChanger) return null;
  return (
    <Chip tone="accent" size="sm" className={className ?? "shrink-0"} title="Game Changer">
      GC
    </Chip>
  );
}

export function CardRow({
  dc,
  deckId,
  format,
  subcategories: _subcategories,
  isOwner: _isOwner,
  dispatch: _dispatch,
  showPrintingMeta = true,
  viewerId,
  ownership,
  viewOptions = DEFAULT_DECK_VIEW_OPTIONS,
}: CardRowProps) {
  const {
    preview,
    rowRef,
    searchClasses,
    searchAttrs,
    previewPayload,
    legality,
  } = useCardRowShared(dc, format);

  const illegalBadge = !legality.legal ? (
    <LegalityBadge
      reasons={legality.reasons}
      triggerClassName="shrink-0 inline-flex items-center rounded text-destructive hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      triggerIcon={<XIcon className="size-3.5" aria-hidden />}
    />
  ) : null;

  const [menuOpen, setMenuOpen] = useState(false);
  const ownershipBadgePrintingId = resolveRowPrintingId(dc);
  const showOwnership =
    !!viewerId &&
    viewOptions.ownership &&
    ownership &&
    ownershipBadgePrintingId !== null;
  const showInventoryMenu = !!viewerId && ownershipBadgePrintingId !== null;
  const priceLabel = formatPriceLabel(dc);
  const showPrice = viewOptions.price && priceLabel !== null;

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

  const row = (
    <li
      ref={rowRef}
      {...searchAttrs}
      data-deck-row
      className={cn(
        "@container/row flex items-center gap-1 text-sm py-0.5 cursor-default break-inside-avoid transition-colors hover:bg-accent/20 hover:ring-1 hover:ring-ring hover:rounded-sm focus-visible:outline-none focus-visible:bg-accent/20 focus-visible:ring-1 focus-visible:ring-ring focus-visible:rounded-sm",
        dc.isSecondary && "opacity-50",
        searchClasses,
      )}
      tabIndex={0}
      onMouseEnter={() => preview?.preview(previewPayload)}
      onFocus={() => preview?.preview(previewPayload)}
      onClick={onRowClick}
      onContextMenu={(e) => {
        if (!showInventoryMenu) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
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
        {dc.isSecondary && (
          <span className="sr-only">
            (also in {dc.categories[0]})
          </span>
        )}
        {illegalBadge}
        <GameChangerChip format={format} gameChanger={dc.card.gameChanger} />
      </div>
      {viewOptions.manaValues && dc.card.manaCost && (
        <ManaCost
          cost={dc.card.manaCost}
          className="shrink-0 hidden md:@[220px]/row:inline-flex md:inline-flex"
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
      {showPrintingMeta && dc.printing && (
        <span className="shrink-0 hidden @[320px]/row:inline-flex text-xs text-muted-foreground font-mono">
          {dc.printing.setCode.toUpperCase()} #{dc.printing.collectorNumber}
          {dc.isFoil ? " ✦" : ""}
        </span>
      )}
      {showInventoryMenu && (
        <InventoryMenu
          printingId={ownershipBadgePrintingId}
          isFoil={dc.isFoil}
          ownershipState={ownership?.state ?? "NOT_OWNED"}
          isPinned={dc.printingId !== null}
          cardName={dc.card.name}
          sourceDeckId={deckId}
          open={menuOpen}
          onOpenChange={setMenuOpen}
        />
      )}
    </li>
  );

  return row;
}
