"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardSearchResult } from "@/lib/search/card-search";
import { useDeckBrowser } from "./deck-browser-context";

/** Multi-select checkbox overlay; renders only while select mode is active. */
export function SelectCheck({ card }: { card: CardSearchResult }) {
  const deck = useDeckBrowser();
  if (!deck.selectMode) return null;
  const on = deck.selected.has(card.id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        deck.toggleSelect(card);
      }}
      aria-pressed={on}
      aria-label={on ? "Deselect card" : "Select card"}
      className={cn(
        "flex items-center justify-center rounded-md backdrop-blur-sm transition-all",
        on ? "border-foreground" : "border-border",
      )}
      style={{
        width: 20,
        height: 20,
        borderWidth: on ? 1 : 1.5,
        borderStyle: "solid",
        background: on
          ? "var(--foreground)"
          : "color-mix(in oklab, var(--background) 75%, transparent)",
      }}
    >
      {on && (
        <Check className="size-3" strokeWidth={3} style={{ color: "var(--background)" }} aria-hidden />
      )}
    </button>
  );
}
