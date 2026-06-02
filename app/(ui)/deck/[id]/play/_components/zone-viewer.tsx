"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionSheet } from "./action-sheet";
import type { PlaytestCard, PlaytestZone } from "../playtest-reducer";

interface ZoneViewerProps {
  zone: PlaytestZone;
  cards: PlaytestCard[];
  open: boolean;
  onClose: () => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
}

export function ZoneViewer({ zone, cards, open, onClose, onSendTo }: ZoneViewerProps) {
  const [selected, setSelected] = useState<PlaytestCard | null>(null);
  const label = zone.charAt(0).toUpperCase() + zone.slice(1);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {label} · {cards.length}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 overflow-y-auto p-1">
            {cards.map((card) => (
              <div
                key={card.instanceId}
                className="aspect-[63/88] cursor-pointer rounded overflow-hidden hover:ring-2 hover:ring-primary"
                onClick={() => setSelected(card)}
              >
                {card.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUri}
                    alt={card.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center p-1">
                    <span className="text-[9px] text-center leading-tight">{card.name}</span>
                  </div>
                )}
              </div>
            ))}
            {cards.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground text-center py-8">
                Empty
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ActionSheet
        card={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onSendTo={(id, z) => {
          onSendTo(id, z);
          setSelected(null);
        }}
      />
    </>
  );
}
