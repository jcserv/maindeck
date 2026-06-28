"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { CardBrowser } from "@/app/_components/builder/card-browser/card-browser";
import { cn } from "@/lib/utils";
import {
  DeckPreviewPane,
  DeckPreviewProvider,
} from "@/app/_components/deck/deck-preview-pane";
import {
  DeckSearchCardsBridge,
  useDeckSearch,
} from "@/app/_components/builder/deck-search-context";
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
  const [browserOpen, setBrowserOpen] = useState(false);
  const bulkEditText = useMemo(() => toPlainText(deck), [deck]);

  // Bridge the search bar's "Browse cards" button (rendered in the header,
  // a separate subtree) through DeckSearchContext. A monotonic tick lets a
  // re-click re-open the panel even after it was closed.
  const browseTick = useDeckSearch()?.browseTick ?? 0;
  const prevBrowseTick = useRef(browseTick);
  useEffect(() => {
    if (browseTick !== prevBrowseTick.current) {
      prevBrowseTick.current = browseTick;
      setBrowserOpen(true);
    }
  }, [browseTick]);

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
    const commanderIdentity = [
      ...new Set(
        activeCards
          .filter((c) => c.zone === "COMMANDER")
          .flatMap((c) => c.card.colorIdentity),
      ),
    ];
    const commanderNames = activeCards
      .filter((c) => c.zone === "COMMANDER")
      .map((c) => c.card.name);
    const browsing = isOwner && browserOpen;
    return (
      <div
        className={cn(
          "flex flex-col gap-6 min-w-0 transition-[padding]",
          // Reflow the decklist left of the docked panel on desktop.
          browsing && "lg:pr-[416px]",
        )}
      >
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
        <div
          className={cn(
            "grid grid-cols-1 gap-6 items-start",
            // While browsing, collapse the preview column so the decklist
            // reflows into the full width left of the docked panel.
            browsing ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_280px]",
          )}
        >
          <div className="flex flex-col gap-6 min-w-0">{lists}</div>
          {!browsing && <DeckPreviewPane />}
        </div>
        {isOwner && (
          <CardBrowser
            open={browserOpen}
            onClose={() => setBrowserOpen(false)}
            deckId={deck.id}
            format={deck.format}
            categories={categoryNames}
            cards={activeCards}
            dispatch={activeDispatch}
            commanderIdentity={commanderIdentity}
            commanderNames={commanderNames}
          />
        )}
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
