"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PlaytestCard, PlaytestZone } from "../playtest-reducer";
import { CardTile } from "./card-tile";
import { ActionSheet } from "./action-sheet";

const DEFAULT_cardW = 240;
const MIN_CARD_W = 80;
const MAX_CARD_W = 400;
const DRAG_THRESHOLD = 5;
const COLS = 5;

interface Position { x: number; y: number }

interface BattlefieldProps {
  cards: PlaytestCard[];
  onTap: (id: string) => void;
  onUntap: (id: string) => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
  className?: string;
}

interface DragState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  startCardX: number;
  startCardY: number;
  moved: boolean;
  containerW: number;
  containerH: number;
}

const RESIZE_CORNERS = [
  { cls: "top-0 left-0 cursor-nwse-resize", dir: -1 },
  { cls: "top-0 right-0 cursor-nesw-resize", dir: 1 },
  { cls: "bottom-0 left-0 cursor-nesw-resize", dir: -1 },
  { cls: "bottom-0 right-0 cursor-nwse-resize", dir: 1 },
] as const;

function ResizeHandles({ cardW, setCardW, resizeRef }: {
  cardW: number;
  setCardW: React.Dispatch<React.SetStateAction<number>>;
  resizeRef: React.MutableRefObject<{ startX: number; startW: number } | null>;
}) {
  return (
    <>
      {RESIZE_CORNERS.map(({ cls, dir }) => (
        <div
          key={cls}
          className={`absolute w-4 h-4 ${cls}`}
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            resizeRef.current = { startX: e.clientX, startW: cardW };
            const onMove = (ev: PointerEvent) => {
              if (!resizeRef.current) return;
              const newW = resizeRef.current.startW + dir * (ev.clientX - resizeRef.current.startX);
              setCardW(Math.min(MAX_CARD_W, Math.max(MIN_CARD_W, newW)));
            };
            const onUp = () => {
              resizeRef.current = null;
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />
      ))}
    </>
  );
}

export function Battlefield({ cards, onTap, onUntap, onSendTo, className }: BattlefieldProps) {
  const [selected, setSelected] = useState<PlaytestCard | null>(null);
  const [zoneDragOver, setZoneDragOver] = useState(false);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, Position>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [cardW, setCardW] = useState(DEFAULT_cardW);
  const cardH = Math.round(cardW * 88 / 63);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropHighlightRef = useRef<{ el: HTMLElement; zone: PlaytestZone } | null>(null);

  const positions = useMemo(() => {
    const result: Record<string, Position> = {};
    cards.forEach((card, i) => {
      result[card.instanceId] = draggedPositions[card.instanceId] ?? {
        x: (i % COLS) * (cardW + 8) + 8,
        y: Math.floor(i / COLS) * (cardH + 8) + 8,
      };
    });
    return result;
  }, [cards, draggedPositions, cardW, cardH]);

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const clearDropHighlight = useCallback(() => {
    if (dropHighlightRef.current) {
      dropHighlightRef.current.el.removeAttribute("data-drop-active");
      dropHighlightRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, card: PlaytestCard) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.stopPropagation();

      const pos = positions[card.instanceId] ?? { x: 8, y: 8 };
      const rect = containerRef.current?.getBoundingClientRect();
      dragRef.current = {
        id: card.instanceId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startCardX: pos.x,
        startCardY: pos.y,
        moved: false,
        containerW: rect?.width ?? Infinity,
        containerH: rect?.height ?? Infinity,
      };

      longPressRef.current = setTimeout(() => {
        longPressRef.current = null;
        dragRef.current = null;
        setSelected(card);
      }, 500);
    },
    [positions],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;

      if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        drag.moved = true;
        cancelLongPress();
        setDraggingId(drag.id);
      }

      if (drag.moved) {
        setDraggedPositions((prev) => ({
          ...prev,
          [drag.id]: {
            x: Math.max(0, Math.min(drag.startCardX + dx, drag.containerW - cardW)),
            y: Math.max(0, Math.min(drag.startCardY + dy, drag.containerH - cardH)),
          },
        }));

        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const dropEl = els.find((el) => (el as HTMLElement).dataset?.["dropZone"]) as HTMLElement | undefined;

        if (dropHighlightRef.current?.el !== dropEl) {
          clearDropHighlight();
          if (dropEl) {
            dropEl.setAttribute("data-drop-active", "true");
            dropHighlightRef.current = { el: dropEl, zone: dropEl.dataset["dropZone"] as PlaytestZone };
          }
        }
      }
    },
    [cancelLongPress, clearDropHighlight, cardW, cardH],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent<HTMLDivElement>, card: PlaytestCard) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);

      const dropZone = dropHighlightRef.current?.zone ?? null;
      clearDropHighlight();

      if (!drag) return;

      if (!drag.moved) {
        cancelLongPress();
        if (card.tapped) {
          onUntap(card.instanceId);
        } else {
          onTap(card.instanceId);
        }
        return;
      }

      if (dropZone) {
        onSendTo(drag.id, dropZone);
      }
    },
    [cancelLongPress, clearDropHighlight, onTap, onUntap, onSendTo],
  );

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
    clearDropHighlight();
    cancelLongPress();
  }, [cancelLongPress, clearDropHighlight]);

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "flex-1 min-h-0 overflow-hidden relative",
          zoneDragOver && "ring-2 ring-inset ring-primary/40",
          className,
        )}
        aria-label="Battlefield"
        onDragOver={(e) => { e.preventDefault(); setZoneDragOver(true); }}
        onDragLeave={() => setZoneDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setZoneDragOver(false);
          const id = e.dataTransfer.getData("text/plain");
          if (id) onSendTo(id, "battlefield");
        }}
      >
        {cards.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
            Drag cards in to get started!
          </div>
        )}
        {cards.map((card) => {
          const pos = positions[card.instanceId] ?? { x: 8, y: 8 };
          const isDragging = draggingId === card.instanceId;
          return (
            <div
              key={card.instanceId}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: cardW,
                zIndex: isDragging ? 50 : 1,
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "none",
              }}
              onPointerDown={(e) => handlePointerDown(e, card)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, card)}
              onPointerCancel={handlePointerCancel}
            >
              <CardTile card={card} className={cn(isDragging && "opacity-60")} />
              <ResizeHandles cardW={cardW} setCardW={setCardW} resizeRef={resizeRef} />
            </div>
          );
        })}
      </div>

      <ActionSheet
        card={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onSendTo={onSendTo}
      />
    </>
  );
}
