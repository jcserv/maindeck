"use client";

import { Plus } from "lucide-react";
import { cn, toTitleCase } from "@/lib/utils";
import { useDeckBrowser } from "./deck-browser-context";

/**
 * Multi-select action bar; shown while items are selected.
 * `inline` renders a full-width tray strip; default is a floating pill.
 */
export function BulkBar({ target, inline = false }: { target: string | null; inline?: boolean }) {
  const deck = useDeckBrowser();
  const n = deck.selected.size;
  const label = target ? toTitleCase(target) : "Mainboard";
  return (
    <div
      className={cn(
        "anim-slide-up flex items-center gap-3",
        inline
          ? "w-full justify-between border-t border-border bg-card px-4 py-2.5"
          : "rounded-xl border border-border bg-popover px-3.5 py-2.5 shadow-2xl",
      )}
    >
      <span className="text-[13px] font-medium">{n} selected</span>
      <button
        type="button"
        onClick={() => deck.clearSelect()}
        className="inline-flex h-8 items-center rounded-lg border border-border px-3.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
      <span className="h-5 w-px bg-border" />
      <span className="text-xs text-muted-foreground">to</span>
      <span className="text-[12.5px] font-semibold">{label}</span>
      <button
        type="button"
        disabled={n === 0 || deck.pending}
        onClick={() => deck.addSelected(target)}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
      >
        <Plus className="size-3.5" strokeWidth={2.6} aria-hidden />
        Add
      </button>
    </div>
  );
}
