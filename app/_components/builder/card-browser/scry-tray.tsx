"use client";

import { useEffect, useRef, useState } from "react";
import { CheckSquare, ScanSearch, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { serializeWhere } from "@/lib/search/syntax-parser";
import type { BrowserState } from "./browser-state";
import { useDeckBrowser } from "./deck-browser-context";
import { TargetPicker } from "./target-picker";
import { FilterBuilder } from "./filter-builder";
import { ColorPip } from "./color-pip";
import { TrayCard } from "./tray-card";
import { BulkBar } from "./bulk-bar";

const WUBRG = ["W", "U", "B", "R", "G"] as const;
const TYPE_CHIPS: ReadonlyArray<[string, string]> = [
  ["creature", "Creature"],
  ["instant", "Instant"],
  ["sorcery", "Sorcery"],
  ["enchantment", "Enchant"],
  ["land", "Land"],
];

/** Mobile (<lg) browser: a bottom filmstrip that keeps the decklist visible. */
export function ScryTray({
  browser,
  onClose,
}: {
  browser: BrowserState;
  onClose: () => void;
}) {
  const deck = useDeckBrowser();
  const [showFilters, setShowFilters] = useState(false);
  const { parsed } = browser;
  const trayRef = useRef<HTMLDivElement>(null);

  // Close when the user points outside the tray (e.g. taps the deck above).
  // Radix dropdowns (TargetPicker) portal to <body>, so ignore those too.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (trayRef.current?.contains(target)) return;
      if (target?.closest("[data-radix-popper-content-wrapper]")) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  function toggleColor(c: string) {
    const colors = parsed.colors.includes(c)
      ? parsed.colors.filter((x) => x !== c)
      : [...parsed.colors, c];
    browser.setRaw(serializeWhere({ ...parsed, colors }));
  }
  function toggleType(t: string) {
    const typeFragments = parsed.typeFragments.includes(t)
      ? parsed.typeFragments.filter((x) => x !== t)
      : [...parsed.typeFragments, t];
    browser.setRaw(serializeWhere({ ...parsed, typeFragments }));
  }

  return (
    <div
      ref={trayRef}
      className="anim-slide-up fixed inset-x-0 bottom-0 z-40 flex max-h-[72vh] flex-col border-t border-border bg-background shadow-2xl pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0"
      role="dialog"
      aria-label="Card browser"
    >
      {/* command row */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-2.5">
        <div className="relative flex-1" style={{ minWidth: 200, maxWidth: 420 }}>
          <ScanSearch
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={browser.raw}
            onChange={(e) => browser.setRaw(e.target.value)}
            placeholder="c:U t:instant cmc<=2"
            aria-label="Scryfall syntax query"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="h-[34px] w-full rounded-lg border border-border bg-card pl-8 pr-2.5 font-mono text-[12.5px] outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className={cn("flex items-center gap-1.5", showFilters && "hidden")}>
          {WUBRG.map((c) => (
            <ColorPip
              key={c}
              color={c}
              size={22}
              active={parsed.colors.includes(c)}
              onClick={() => toggleColor(c)}
            />
          ))}
        </div>
        <span className="hidden h-[18px] w-px bg-border lg:block" />
        <div className="hidden items-center gap-1.5 lg:flex">
          {TYPE_CHIPS.map(([v, label]) => {
            const on = parsed.typeFragments.includes(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggleType(v)}
                className={cn(
                  "rounded-md px-2 py-[3px] text-[11px] transition-colors",
                  on
                    ? "bg-foreground font-semibold text-background"
                    : "bg-muted font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
            showFilters
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-foreground",
          )}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Filters
          {browser.activeCount > 0 ? ` (${browser.activeCount})` : ""}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => deck.setSelectMode(!deck.selectMode)}
          title="Multi-select"
          aria-pressed={deck.selectMode}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border transition-colors",
            deck.selectMode
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <CheckSquare className="size-3.5" aria-hidden />
        </button>
        <TargetPicker
          value={deck.target}
          categories={deck.categories}
          onChange={deck.setTarget}
        />
      </div>

      {deck.selectMode && <BulkBar inline target={deck.target} />}

      {/* filters sheet */}
      {showFilters && (
        <div className="anim-fade scroll-thin max-h-[300px] overflow-y-auto px-4 pb-4 pt-3">
          <div className="mx-auto max-w-[880px]">
            <FilterBuilder parsed={parsed} onChange={browser.setRaw} small />
          </div>
        </div>
      )}

      {/* filmstrip — hidden while picking filters, and until there's a query
          or filter so an empty tray doesn't cover the deck */}
      {!showFilters && browser.raw.trim() !== "" && (
      <div className="relative">
        <div className="scroll-none flex items-center gap-3 overflow-x-auto p-4" style={{ height: 248 }}>
          {browser.results.length === 0 ? (
            <div className="flex w-full items-center justify-center text-[13px] text-muted-foreground">
              {browser.error
                ? browser.error
                : browser.loading
                  ? "Searching…"
                  : "No cards match — adjust your filters."}
            </div>
          ) : (
            <>
              {browser.results.map((c) => (
                <TrayCard key={c.id} card={c} />
              ))}
              {browser.hasMore && (
                <button
                  type="button"
                  onClick={browser.showMore}
                  disabled={browser.loadingMore}
                  className="h-full shrink-0 rounded-xl border border-border px-4 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  style={{ width: 96 }}
                >
                  {browser.loadingMore ? "…" : "Show more"}
                </button>
              )}
            </>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-1.5 left-4 flex items-center gap-3 text-[10.5px] text-muted-foreground">
          <span className="font-mono">{browser.count} results</span>
          <span>· deck stays visible above · tap or flick ↑ to add</span>
        </div>
      </div>
      )}
    </div>
  );
}
