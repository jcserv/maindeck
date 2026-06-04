"use client";

import { useState } from "react";
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

  // Derive active selection: valid only while drawer open and card still in hand
  const activeSelected =
    open && selected && hand.some((c) => c.instanceId === selected.instanceId)
      ? selected
      : null;

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
          onOpenChange(next);
        }}
        title={`Hand · ${hand.length}`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {hand.map((card) => (
              <button
                key={card.instanceId}
                type="button"
                className="shrink-0 w-20 cursor-pointer"
                onClick={() => setSelected(card)}
                aria-label={card.name}
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
              </button>
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
        card={activeSelected}
        open={activeSelected !== null}
        onClose={() => setSelected(null)}
        onSendTo={onSendTo}
      />
    </>
  );
}
