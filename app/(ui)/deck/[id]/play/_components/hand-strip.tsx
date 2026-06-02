"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaytestCard, PlaytestZone } from "../playtest-reducer";
import { ActionSheet } from "./action-sheet";

interface HandStripProps {
  hand: PlaytestCard[];
  librarySize: number;
  onDraw: () => void;
  onMulligan: () => void;
  onScry: () => void;
  onUntapAll: () => void;
  onNextTurn: () => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
  className?: string;
}

export function HandStrip({
  hand,
  librarySize,
  onDraw,
  onMulligan,
  onScry,
  onUntapAll,
  onNextTurn,
  onSendTo,
  className,
}: HandStripProps) {
  const [selected, setSelected] = useState<PlaytestCard | null>(null);

  return (
    <>
      <div
        data-drop-zone="hand"
        className={cn(
          "h-[200px] shrink-0 border-t border-border flex flex-col transition-colors",
          "data-[drop-active]:bg-primary/10 data-[drop-active]:border-primary",
          className,
        )}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
          <span className="text-xs text-muted-foreground">
            Hand · {hand.length} &nbsp; Lib · {librarySize}
          </span>
          <div className="flex gap-1 ml-auto">
            <Button size="sm" variant="outline" className="text-xs h-6" onClick={onDraw}>
              Draw
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-6" onClick={onMulligan}>
              Mull {Math.max(0, hand.length - 1)}
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-6" onClick={onScry}>
              Scry
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-6" onClick={onUntapAll}>
              Untap All
            </Button>
            <Button size="sm" className="text-xs h-6" onClick={onNextTurn}>
              Next Turn
            </Button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto flex-1 p-2 items-start">
          {hand.map((card) => (
            <div
              key={card.instanceId}
              className="shrink-0 h-full cursor-pointer"
              style={{ width: `calc((100% - ${Math.max(hand.length - 1, 0) * 8}px) / ${Math.max(hand.length, 1)})`, minWidth: 60, maxWidth: 90 }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", card.instanceId);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => setSelected(card)}
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

      <ActionSheet
        card={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onSendTo={onSendTo}
      />
    </>
  );
}
