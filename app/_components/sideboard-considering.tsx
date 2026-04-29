"use client";

import { useSearchParams } from "next/navigation";
import { CardRow } from "@/app/_components/card-row";
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

interface SideboardConsideringProps {
  deck: Deck;
  cards: DeckCard[];
  dispatch: (action: ZoneAction) => void;
  isOwner: boolean;
}

interface ZoneBlockProps {
  title: string;
  emptyHint: string;
  cards: DeckCard[];
  deckId: string;
  format: import("@/lib/generated/prisma/enums").Format;
  subcategories: string[];
  dispatch: (a: ZoneAction) => void;
}

function ZoneBlock({
  title,
  emptyHint,
  cards,
  deckId,
  format,
  subcategories,
  dispatch,
}: ZoneBlockProps) {
  const total = cards.reduce((s, c) => s + c.quantity, 0);

  return (
    <section
      aria-label={`${title} (${total})`}
      className="flex flex-col gap-1.5 rounded-md -mx-2 px-2 pb-2"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          {title} <span className="tabular-nums">({total})</span>
        </h2>
      </div>
      {cards.length === 0 ? (
        <p className="text-xs text-muted-foreground italic leading-relaxed min-h-6">
          {emptyHint}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {cards.map((dc) => (
            <CardRow
              key={dc.id}
              dc={dc}
              deckId={deckId}
              format={format}
              subcategories={subcategories}
              isOwner={false}
              dispatch={dispatch}
              showPrintingMeta={false}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function SideboardConsidering({
  deck,
  cards,
  dispatch,
  isOwner: _isOwner,
}: SideboardConsideringProps) {
  const searchParams = useSearchParams();
  const sortKey = parseSortKey(searchParams.get("sort"));
  const sortDir = parseSortDir(searchParams.get("dir"));

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
      <ZoneBlock
        title="Sideboard"
        emptyHint="Cards you swap in between games or fetch from outside the game."
        cards={sideboard}
        deckId={deck.id}
        format={deck.format}
        subcategories={subcategoryNames}
        dispatch={dispatch}
      />
      <ZoneBlock
        title="Considering"
        emptyHint="A scratchpad for cards you're evaluating."
        cards={considering}
        deckId={deck.id}
        format={deck.format}
        subcategories={subcategoryNames}
        dispatch={dispatch}
      />
    </div>
  );
}
