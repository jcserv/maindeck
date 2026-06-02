"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { PlaytestCard, PlaytestZone } from "../playtest-reducer";

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 300;

interface HandStripProps {
  hand: PlaytestCard[];
  onSendTo: (id: string, zone: PlaytestZone) => void;
  className?: string;
}

export function HandStrip({ hand, onSendTo, className }: HandStripProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(DEFAULT_HEIGHT);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartHeight.current = height;

    const onMove = (ev: PointerEvent) => {
      if (dragStartY.current === null) return;
      const delta = dragStartY.current - ev.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartHeight.current + delta)));
    };
    const onUp = () => {
      dragStartY.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [height]);

  return (
    <>
      {/* Drag handle */}
      <div
        className="h-2 shrink-0 flex items-center justify-center cursor-ns-resize group border-t border-border hover:border-primary transition-colors"
        onPointerDown={onPointerDown}
      >
        <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-primary transition-colors" />
      </div>

      <div
        data-drop-zone="hand"
        className={cn(
          "shrink-0 flex flex-col transition-colors",
          "data-[drop-active]:bg-primary/10",
          className,
        )}
        style={{ height }}
      >
        <div className="flex gap-2 overflow-x-auto flex-1 p-2">
          {hand.map((card) => (
            <div
              key={card.instanceId}
              className="shrink-0 h-full aspect-[63/88]"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", card.instanceId);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              {card.imageUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.imageUri}
                  alt={card.name}
                  className="h-full w-full object-contain rounded"
                  draggable={false}
                />
              ) : (
                <div className="h-full aspect-[63/88] bg-muted rounded flex items-center justify-center p-1">
                  <span className="text-[9px] text-center leading-tight">{card.name}</span>
                </div>
              )}
            </div>
          ))}
          {hand.length === 0 && (
            <p className="text-sm text-muted-foreground self-center mx-auto">No cards in hand</p>
          )}
        </div>
      </div>

    </>
  );
}
