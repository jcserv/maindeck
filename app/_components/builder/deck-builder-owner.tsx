"use client";

import { useState, useTransition, type ReactNode } from "react";
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
import { useOptimistic } from "react";
import type { Zone } from "@/lib/generated/prisma/enums";
import { moveCardTo } from "@/app/_actions/deck/categories";
import { DecklistDnd } from "@/app/_components/builder/decklist-dnd";
import { SideboardConsideringDnd } from "@/app/_components/builder/sideboard-considering-dnd";
import {
  applyZoneOptimistic,
  type Deck,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";

interface DroppableData {
  zone: Zone;
  category: string | null;
}

interface DeckBuilderOwnerProps {
  deck: Deck;
  children: (
    cards: DeckCard[],
    dispatch: (action: ZoneAction) => void,
    lists: ReactNode,
  ) => ReactNode;
}

export function DeckBuilderOwner({ deck, children }: DeckBuilderOwnerProps) {
  const [cards, dispatch] = useOptimistic(deck.cards, applyZoneOptimistic);
  const [, startTransition] = useTransition();
  const [draggingCard, setDraggingCard] = useState<DeckCard | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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
      await moveCardTo(deck.id, deckCardId, target.zone, target.category);
    });
  }

  const lists = (
    <>
      <DecklistDnd
        deck={deck}
        cards={cards}
        dispatch={dispatch}
        isOwner
      />
      <SideboardConsideringDnd
        deck={deck}
        cards={cards}
        dispatch={dispatch}
        isOwner
      />
    </>
  );

  return (
    <DndContext
      id="deck-builder"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {children(cards, dispatch, lists)}
      <DragOverlay>
        {draggingCard ? (
          <div className="bg-popover border rounded-md px-2 py-1 text-sm shadow-lg">
            {draggingCard.card.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
