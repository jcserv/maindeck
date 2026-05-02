"use client";

import { useMemo, useOptimistic, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  DeckPreviewPane,
  DeckPreviewProvider,
} from "@/app/_components/deck-preview-pane";
import { DeckSearchCardsBridge } from "@/app/_components/deck-search-context";
import { Decklist } from "@/app/_components/decklist";
import { DecklistToolbar } from "@/app/_components/decklist-toolbar";
import { SideboardConsidering } from "@/app/_components/sideboard-considering";
import { toPlainText } from "@/lib/deck/io/serialize";
import {
  applyZoneOptimistic,
  type Deck,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";

const DeckBuilderOwner = dynamic(
  () =>
    import("@/app/_components/deck-builder-owner").then(
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
}

export function DeckBuilder({ deck, isOwner }: DeckBuilderProps) {
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
    return (
      <div className="flex flex-col gap-6 min-w-0">
        <DeckSearchCardsBridge
          cards={activeCards}
          categories={categoryNames}
          format={deck.format}
        />
        <DecklistToolbar
          deckId={deck.id}
          isOwner={isOwner}
          initialBulkEditText={bulkEditText}
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
        <DeckBuilderOwner deck={deck}>
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
            />
            <SideboardConsidering
              deck={deck}
              cards={cards}
              dispatch={dispatch}
              isOwner={false}
            />
          </>,
        )
      )}
    </DeckPreviewProvider>
  );
}
