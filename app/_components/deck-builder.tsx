"use client";

import { useMemo, useOptimistic, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";
import {
  DeckPreviewPane,
  DeckPreviewProvider,
} from "@/app/_components/deck-preview-pane";
import { DeckSearchCardsBridge } from "@/app/_components/deck-search-context";
import { Decklist } from "@/app/_components/decklist";
import { DecklistToolbar } from "@/app/_components/decklist-toolbar";
import { SideboardConsidering } from "@/app/_components/sideboard-considering";
import { moveCardTo } from "@/lib/deck/category-actions";
import { toPlainText } from "@/lib/deck-io/serialize";
import { Zone } from "@/lib/generated/prisma/enums";
import {
  applyZoneOptimistic,
  type Deck,
  type DeckCard,
} from "@/lib/deck/zone-view";

interface DeckBuilderProps {
  deck: Deck;
  isOwner: boolean;
}

interface DroppableData {
  zone: Zone;
  category: string | null;
}

export function DeckBuilder({ deck, isOwner }: DeckBuilderProps) {
  const [cards, dispatch] = useOptimistic(deck.cards, applyZoneOptimistic);
  const [, startTransition] = useTransition();
  const [draggingCard, setDraggingCard] = useState<DeckCard | null>(null);
  const router = useRouter();

  const bulkEditText = useMemo(() => toPlainText(deck), [deck]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const categoryNames = useMemo(
    () =>
      [...deck.categories]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.name),
    [deck.categories],
  );

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setDraggingCard(cards.find((c) => c.id === id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingCard(null);
    const { active, over } = event;
    if (!over) return;

    const target = over.data.current as DroppableData | undefined;
    if (!target) return;
    const deckCardId = String(active.id);
    const source = cards.find((c) => c.id === deckCardId);
    if (!source) return;
    if (source.zone === target.zone && source.category === target.category)
      return;

    startTransition(async () => {
      dispatch({
        type: "move",
        deckCardId,
        zone: target.zone,
        category: target.category,
      });
      try {
        await moveCardTo(deck.id, deckCardId, target.zone, target.category);
      } finally {
        router.refresh();
      }
    });
  }

  const body: ReactNode = (
    <div className="flex flex-col gap-6 min-w-0">
      <DeckSearchCardsBridge
        cards={cards}
        categories={categoryNames}
        format={deck.format}
      />
      <DecklistToolbar
        deckId={deck.id}
        isOwner={isOwner}
        initialBulkEditText={bulkEditText}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <Decklist
            deck={deck}
            cards={cards}
            dispatch={dispatch}
            isOwner={isOwner}
          />
          <SideboardConsidering
            deck={deck}
            cards={cards}
            dispatch={dispatch}
            isOwner={isOwner}
          />
        </div>
        <DeckPreviewPane />
      </div>
    </div>
  );

  return (
    <DeckPreviewProvider>
      {isOwner ? (
        <DndContext
          id="deck-builder"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {body}
          <DragOverlay>
            {draggingCard ? (
              <div className="bg-popover border rounded-md px-2 py-1 text-sm shadow-lg">
                {draggingCard.card.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        body
      )}
    </DeckPreviewProvider>
  );
}
