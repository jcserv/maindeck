"use client";

import { useState, useEffect } from "react";
import BottomSheet from "@/app/_components/bottom-sheet";
import { Button } from "@/components/ui/button";
import type { PlaytestCard, PlaytestZone } from "../playtest-reducer";
import { ActionSheet } from "./action-sheet";

interface HandDrawerProps {
  hand: PlaytestCard[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMulligan: () => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
}

export function HandDrawer({ hand, open, onOpenChange, onMulligan, onSendTo }: HandDrawerProps) {
  const [selected, setSelected] = useState<PlaytestCard | null>(null);

  // Clear selected when drawer closes or card is no longer in hand
  useEffect(() => {
    if (!open) {
      setSelected(null);
    } else if (selected && !hand.find((c) => c.instanceId === selected.instanceId)) {
      setSelected(null);
    }
  }, [open, selected, hand]);

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`Hand · ${hand.length}`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {hand.map((card) => (
              <div
                key={card.instanceId}
                className="shrink-0 w-20 cursor-pointer"
                onClick={() => setSelected(card)}
              >
                {card.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUri}
                    alt={card.name}
                    className="w-full rounded-md"
                    draggable={false}
                  />
                ) : (
                  <div className="aspect-63/88 bg-muted rounded-md flex items-center justify-center p-1">
                    <span className="text-[9px] text-center leading-tight">{card.name}</span>
                  </div>
                )}
              </div>
            ))}
            {hand.length === 0 && (
              <p className="text-sm text-muted-foreground">No cards in hand</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onMulligan} className="w-full">
            Mulligan to {Math.max(0, hand.length - 1)}
          </Button>
        </div>
      </BottomSheet>

      <ActionSheet
        card={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onSendTo={onSendTo}
      />
    </>
  );
}
