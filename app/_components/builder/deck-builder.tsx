"use client";

import { useMemo, useOptimistic, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  DeckPreviewPane,
  DeckPreviewProvider,
} from "@/app/_components/deck/deck-preview-pane";
import { DeckSearchCardsBridge } from "@/app/_components/builder/deck-search-context";
import { Decklist } from "@/app/_components/builder/decklist";
import { DecklistToolbar } from "@/app/_components/builder/decklist-toolbar";
import { SideboardConsidering } from "@/app/_components/builder/sideboard-considering";
import { toPlainText } from "@/lib/deck/io/serialize";
import {
  computeColorPipsRaw,
  countLands,
  type DeckCardWithRelations,
} from "@/lib/stats/compute";
import {
  applyZoneOptimistic,
  type Deck,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";
import type { ViewerHolding } from "@/lib/inventory/state";

const DeckBuilderOwner = dynamic(
  () =>
    import("@/app/_components/builder/deck-builder-owner").then(
      (m) => m.DeckBuilderOwner,
    ),
  {
    ssr: false,
    loading: () => <div className="h-[40px]" aria-hidden />,
  },
);

interface DeckBuilderProps {
  deck: Deck;
  isOwner: boolean;
  viewerId?: string | undefined;
  viewerHoldings?: ViewerHolding[] | undefined;
  /** Toggle optional toolbar features. Both default to enabled. */
  toolbar?: { addLands?: boolean; autoCategorize?: boolean } | undefined;
}

export function DeckBuilder({
  deck,
  isOwner,
  viewerId,
  viewerHoldings = [],
  toolbar,
}: DeckBuilderProps) {
  const [cards, dispatch] = useOptimistic(deck.cards, applyZoneOptimistic);
  const bulkEditText = useMemo(() => toPlainText(deck), [deck]);

  const categoryNames = useMemo(
    () =>
      [...deck.categories]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.name),
    [deck.categories],
  );

  function renderShell(
    activeCards: DeckCard[],
    activeDispatch: (action: ZoneAction) => void,
    lists: ReactNode,
  ) {
    const statCards = activeCards as unknown as DeckCardWithRelations[];
    const pips = computeColorPipsRaw(statCards);
    const currentLandCount = countLands(statCards);
    const colorIdentity = [
      ...new Set(
        activeCards
          .filter((c) => c.zone === "MAINBOARD" || c.zone === "COMMANDER")
          .flatMap((c) => c.card.colorIdentity),
      ),
    ];
    return (
      <div className="flex flex-col gap-6 min-w-0">
        <DeckSearchCardsBridge
          cards={activeCards}
          categories={categoryNames}
          format={deck.format}
        />
        <DecklistToolbar
          deckId={deck.id}
          deckFormat={deck.format}
          isOwner={isOwner}
          initialBulkEditText={bulkEditText}
          viewerId={viewerId}
          colorIdentity={colorIdentity}
          pips={pips}
          currentLandCount={currentLandCount}
          showAddLands={toolbar?.addLands ?? true}
          showAutoCategorize={toolbar?.autoCategorize ?? true}
        />
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
          <div className="flex flex-col gap-6 min-w-0">{lists}</div>
          <DeckPreviewPane />
        </div>
      </div>
    );
  }

  return (
    <DeckPreviewProvider>
      {isOwner ? (
        <DeckBuilderOwner
          deck={deck}
          viewerId={viewerId}
          viewerHoldings={viewerHoldings}
        >
          {(ownerCards, ownerDispatch, ownerLists) =>
            renderShell(ownerCards, ownerDispatch, ownerLists)
          }
        </DeckBuilderOwner>
      ) : (
        renderShell(
          cards,
          dispatch,
          <>
            <Decklist
              deck={deck}
              cards={cards}
              dispatch={dispatch}
              isOwner={false}
              viewerId={viewerId}
              viewerHoldings={viewerHoldings}
            />
            <SideboardConsidering
              deck={deck}
              cards={cards}
              dispatch={dispatch}
              isOwner={false}
              viewerId={viewerId}
              viewerHoldings={viewerHoldings}
            />
          </>,
        )
      )}
    </DeckPreviewProvider>
  );
}
