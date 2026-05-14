"use client";

import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { CardRowSortable } from "@/app/_components/builder/card-row-sortable";
import { useHeaderSearch } from "@/app/_components/header-search/header-search-context";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import {
  parseSortDir,
  parseSortKey,
  sortCards,
} from "@/lib/deck/group-sort";
import {
  type Deck,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";
import {
  resolveOwnership,
  useDeckViewOptions,
  type DeckViewOptions,
} from "@/app/_components/builder/decklist";
import type { ViewerHolding } from "@/lib/inventory/state";
import { cn } from "@/lib/utils";

interface SideboardConsideringDndProps {
  deck: Deck;
  cards: DeckCard[];
  dispatch: (action: ZoneAction) => void;
  isOwner: boolean;
  viewerId?: string | undefined;
  viewerHoldings?: ViewerHolding[] | undefined;
}

interface ZoneBlockDndProps {
  title: string;
  emptyHint: string;
  zone: Zone;
  cards: DeckCard[];
  deckId: string;
  format: Format;
  subcategories: string[];
  dispatch: (a: ZoneAction) => void;
  viewerId?: string | undefined;
  viewerHoldings?: ViewerHolding[] | undefined;
  viewOptions: DeckViewOptions;
}

function ZoneBlockDnd({
  title,
  emptyHint,
  zone,
  cards,
  deckId,
  format,
  subcategories,
  dispatch,
  viewerId,
  viewerHoldings,
  viewOptions,
}: ZoneBlockDndProps) {
  const { focus } = useHeaderSearch();
  const total = cards.reduce((s, c) => s + c.quantity, 0);
  const { setNodeRef } = useDroppable({
    id: `zone:${zone}`,
    data: { zone, category: null },
  });
  const { active, over } = useDndContext();
  const overTarget = over?.data.current as
    | { zone?: Zone; category?: string | null }
    | undefined;
  const source = active?.data.current as
    | { zone?: Zone; category?: string | null }
    | undefined;
  const isOver =
    !!active &&
    overTarget?.zone === zone &&
    (overTarget?.category ?? null) === null &&
    !(source?.zone === zone && (source?.category ?? null) === null);

  return (
    <section
      aria-label={`${title} (${total})`}
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-1.5 transition-colors rounded-md -mx-2 px-2 pb-2",
        isOver && "bg-accent/30 ring-1 ring-accent",
      )}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          {title} <span className="tabular-nums">({total})</span>
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => focus({ zone })}
          className="h-7 px-2 text-xs text-muted-foreground"
          aria-label={`Add card to ${title}`}
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </Button>
      </div>
      {cards.length === 0 ? (
        <p className="text-xs text-muted-foreground italic leading-relaxed min-h-6">
          {isOver ? "Drop to move here." : emptyHint}
        </p>
      ) : (
        <SortableContext
          items={cards.map((dc) => dc.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-0.5">
            {cards.map((dc) => {
              const ownership = viewerHoldings
                ? resolveOwnership(dc, viewerHoldings)
                : undefined;
              return (
                <CardRowSortable
                  key={dc.id}
                  dc={dc}
                  deckId={deckId}
                  format={format}
                  subcategories={subcategories}
                  dispatch={dispatch}
                  showPrintingMeta={false}
                  viewerId={viewerId}
                  ownership={ownership}
                  viewOptions={viewOptions}
                />
              );
            })}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}

export function SideboardConsideringDnd({
  deck,
  cards,
  dispatch,
  isOwner: _isOwner,
  viewerId,
  viewerHoldings,
}: SideboardConsideringDndProps) {
  const searchParams = useSearchParams();
  const sortKey = parseSortKey(searchParams.get("sort"));
  const sortDir = parseSortDir(searchParams.get("dir"));
  const { options: viewOptions } = useDeckViewOptions(deck.id);

  const sideboard = sortCards(
    cards.filter((c) => c.zone === "SIDEBOARD"),
    sortKey,
    sortDir,
  );
  const considering = sortCards(
    cards.filter((c) => c.zone === "CONSIDERING"),
    sortKey,
    sortDir,
  );

  const subcategoryNames = [...deck.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.name);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <ZoneBlockDnd
        title="Sideboard"
        emptyHint="Cards you swap in between games or fetch from outside the game."
        zone={Zone.SIDEBOARD}
        cards={sideboard}
        deckId={deck.id}
        format={deck.format}
        subcategories={subcategoryNames}
        dispatch={dispatch}
        viewerId={viewerId}
        viewerHoldings={viewerHoldings}
        viewOptions={viewOptions}
      />
      <ZoneBlockDnd
        title="Considering"
        emptyHint="A scratchpad for cards you're evaluating."
        zone={Zone.CONSIDERING}
        cards={considering}
        deckId={deck.id}
        format={deck.format}
        subcategories={subcategoryNames}
        dispatch={dispatch}
        viewerId={viewerId}
        viewerHoldings={viewerHoldings}
        viewOptions={viewOptions}
      />
    </div>
  );
}
