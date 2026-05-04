"use client";

import { useState } from "react";
import Image from "next/image";
import { drawHand, type DrawnCard } from "@/lib/deck/shuffle";
import { resolveCardImage, type DeckCard } from "@/lib/deck/zone-view";
import { Button } from "@/components/ui/button";

interface DrawHandProps {
  cards: DeckCard[];
}

export function DrawHand({ cards }: DrawHandProps) {
  const [hand, setHand] = useState<DrawnCard[] | null>(null);
  const [mulliganSize, setMulliganSize] = useState(7);

  const mainboardCount = cards
    .filter((dc) => dc.zone === "MAINBOARD")
    .reduce((sum, dc) => sum + dc.quantity, 0);

  if (mainboardCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No cards in mainboard to draw from.
      </p>
    );
  }

  function handleDraw() {
    setMulliganSize(7);
    setHand(drawHand(cards, 7));
  }

  function handleDrawAnother() {
    setHand(drawHand(cards, mulliganSize));
  }

  function handleMulligan() {
    const nextSize = Math.max(1, mulliganSize - 1);
    setMulliganSize(nextSize);
    setHand(drawHand(cards, nextSize));
  }

  function handleReset() {
    setHand(null);
    setMulliganSize(7);
  }

  if (!hand) {
    return (
      <Button
        className="min-h-11"
        onClick={handleDraw}
        aria-label="Draw a 7-card opening hand"
      >
        Draw Hand
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Card thumbnails */}
      <div className="w-full overflow-x-auto pb-2 sm:overflow-x-visible sm:pb-0">
        <div
          className="flex gap-2 justify-center"
          role="list"
          aria-label={`Drawn hand: ${hand.length} card${hand.length !== 1 ? "s" : ""}`}
        >
          {hand.map((item, index) => {
            const imageUri = resolveCardImage(item);
            return (
              <div
                key={`${item.id}-${index}`}
                role="listitem"
                className="relative aspect-[63/88] w-24 sm:w-32 md:w-36 shrink-0 rounded-md bg-muted overflow-hidden"
              >
                {imageUri ? (
                  <Image
                    src={imageUri}
                    alt={item.card.name}
                    fill
                    sizes="(min-width: 768px) 144px, (min-width: 640px) 128px, 96px"
                    quality={65}
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">
                    {item.card.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action controls */}
      <div className="flex flex-wrap justify-center items-center gap-2">
        <Button
          className="min-h-11"
          onClick={handleDrawAnother}
          aria-label="Draw another hand"
        >
          Draw Another
        </Button>

        <Button
          variant="outline"
          className="min-h-11"
          onClick={handleMulligan}
          disabled={mulliganSize <= 1}
          aria-label={`Mulligan to ${Math.max(1, mulliganSize - 1)} card${Math.max(1, mulliganSize - 1) !== 1 ? "s" : ""}`}
        >
          Mulligan
          {mulliganSize < 7 && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({mulliganSize}&rarr;{Math.max(1, mulliganSize - 1)})
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          className="min-h-11"
          onClick={handleReset}
          aria-label="Reset to initial draw state"
        >
          Reset
        </Button>

        {mulliganSize < 7 && (
          <span
            className="text-xs text-muted-foreground"
            aria-live="polite"
            aria-atomic="true"
          >
            Hand size: {mulliganSize}
          </span>
        )}
      </div>
    </div>
  );
}
