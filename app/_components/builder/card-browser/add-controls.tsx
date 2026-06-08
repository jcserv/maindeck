"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardSearchResult } from "@/lib/search/card-search";
import { useDeckBrowser } from "./deck-browser-context";

interface AddControlsProps {
  card: CardSearchResult;
  size?: "sm" | "md";
}

/**
 * Add button that becomes a −/qty/+ stepper once the card is in the deck.
 * Shared by the grid tile and condensed row. Stops propagation so clicks here
 * don't trigger the surrounding tile's add/select handler.
 */
export function AddControls({ card, size = "md" }: AddControlsProps) {
  const deck = useDeckBrowser();
  const qty = deck.countOf(card.id);
  const h = size === "sm" ? 26 : 30;

  if (qty > 0) {
    return (
      <div
        className="inline-flex items-stretch overflow-hidden rounded-lg border border-border bg-card"
        style={{ height: h }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deck.remove(card);
          }}
          className="flex items-center justify-center text-foreground hover:bg-muted"
          style={{ width: h - 2 }}
          aria-label="Remove one"
        >
          <Minus className="size-3.5" strokeWidth={2.4} aria-hidden />
        </button>
        <span
          className="flex items-center justify-center font-mono tabular-nums font-semibold border-x border-border"
          style={{ minWidth: h - 4, fontSize: size === "sm" ? 12 : 13 }}
        >
          {qty}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deck.add(card, 1);
          }}
          className="flex items-center justify-center text-foreground hover:bg-muted"
          style={{ width: h - 2 }}
          aria-label="Add one"
        >
          <Plus className="size-3.5" strokeWidth={2.4} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        deck.add(card, 1);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90",
      )}
      style={{ height: h, fontSize: size === "sm" ? 12 : 13 }}
    >
      <Plus className="size-3.5" strokeWidth={2.6} aria-hidden />
      Add
    </button>
  );
}
