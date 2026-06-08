"use client";

import { CheckSquare, ChevronRight, Search } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";
import type { BrowserState } from "./browser-state";
import { useDeckBrowser } from "./deck-browser-context";
import { ModeTabs } from "./mode-tabs";
import { DensityToggle } from "./density-toggle";
import { TargetPicker } from "./target-picker";
import { SyntaxInput } from "./syntax-input";
import { FilterBuilder } from "./filter-builder";
import { BrowserCard } from "./browser-card";
import { CondensedRow } from "./condensed-row";
import { BulkBar } from "./bulk-bar";

/** Desktop (≥lg) docked browser: fixed to the right edge beside the decklist. */
export function SidePanel({
  browser,
  onClose,
}: {
  browser: BrowserState;
  onClose: () => void;
}) {
  const deck = useDeckBrowser();
  return (
    <div
      className="anim-slide-right fixed bottom-0 right-0 top-14 z-40 flex w-[400px] max-w-[100vw] flex-col border-l border-border bg-background shadow-2xl"
      role="dialog"
      aria-label="Card browser"
    >
      {/* header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <Eyebrow>Card Browser</Eyebrow>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => deck.setSelectMode(!deck.selectMode)}
          title="Multi-select"
          aria-pressed={deck.selectMode}
          className={cn(
            "flex size-[30px] items-center justify-center rounded-md border transition-colors",
            deck.selectMode
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <CheckSquare className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card browser"
          className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      {/* controls */}
      <div className="shrink-0 border-b border-border p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <ModeTabs
            mode={browser.mode}
            onMode={browser.setMode}
            activeCount={browser.activeCount}
          />
          <DensityToggle value={browser.density} onChange={browser.setDensity} />
        </div>
        {browser.mode === "syntax" && (
          <div className="mb-2.5">
            <SyntaxInput value={browser.raw} onChange={browser.setRaw} autoFocus />
          </div>
        )}
        <div className="flex items-center justify-between">
          <TargetPicker
            value={deck.target}
            categories={deck.categories}
            onChange={deck.setTarget}
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {browser.count} card{browser.count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* scroll body */}
      <div className="scroll-thin flex-1 overflow-y-auto p-3">
        {browser.mode === "filters" && (
          <div className="mb-4 border-b border-border pb-4">
            <FilterBuilder parsed={browser.parsed} onChange={browser.setRaw} small />
          </div>
        )}
        <ResultsBody browser={browser} />
      </div>

      {deck.selectMode && (
        <div className="absolute inset-x-3 bottom-3 z-10">
          <BulkBar target={deck.target} />
        </div>
      )}
    </div>
  );
}

function ResultsBody({ browser }: { browser: BrowserState }) {
  if (browser.error) {
    return (
      <p role="alert" className="px-0.5 py-2 text-[12.5px] text-destructive">
        {browser.error}
      </p>
    );
  }
  if (browser.raw.trim() === "") {
    return (
      <p className="px-0.5 py-2 text-[12.5px] text-muted-foreground">
        Pick filters or type a query to browse cards.
      </p>
    );
  }
  if (browser.results.length === 0) {
    return (
      <p className="px-0.5 py-2 text-[12.5px] text-muted-foreground">
        {browser.loading ? "Searching…" : "No cards match these filters."}
      </p>
    );
  }
  return (
    <>
      {browser.density === "grid" ? (
        <div className="grid grid-cols-2 gap-2.5">
          {browser.results.map((c) => (
            <BrowserCard key={c.id} card={c} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-px">
          {browser.results.map((c) => (
            <CondensedRow key={c.id} card={c} />
          ))}
        </div>
      )}
      {browser.hasMore && (
        <button
          type="button"
          onClick={browser.showMore}
          disabled={browser.loadingMore}
          className="mt-3 w-full rounded-md border border-border py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {browser.loadingMore ? "Loading…" : "Show more"}
        </button>
      )}
    </>
  );
}
