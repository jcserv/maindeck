"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaytestCard } from "../playtest-reducer";

interface ScryOverlayProps {
  cards: PlaytestCard[];
  onResolve: (toBottom: string[]) => void;
}

export function ScryOverlay({ cards, onResolve }: ScryOverlayProps) {
  const [toBottom, setToBottom] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setToBottom((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-lg p-4 flex flex-col gap-4 max-w-sm w-full mx-4">
        <div>
          <p className="font-semibold text-sm">Scry {cards.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle cards to send to the bottom; the rest stay on top.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {cards.map((card) => {
            const isBottom = toBottom.has(card.instanceId);
            return (
              <button
                key={card.instanceId}
                onClick={() => toggle(card.instanceId)}
                className={[
                  "flex items-center gap-3 rounded border p-2 text-left transition-colors",
                  isBottom
                    ? "border-destructive/60 bg-destructive/10 text-muted-foreground"
                    : "border-border bg-muted/40 hover:bg-muted",
                ].join(" ")}
              >
                {card.imageUri && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUri}
                    alt={card.name}
                    className="w-10 h-14 rounded object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{card.name}</p>
                  {card.typeLine && (
                    <p className="text-xs text-muted-foreground truncate">{card.typeLine}</p>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold shrink-0 w-16 justify-end">
                  {isBottom ? <><ArrowDown size={12} /> Bottom</> : <><ArrowUp size={12} /> Top</>}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={() => onResolve(Array.from(toBottom))}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}
