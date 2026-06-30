"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Kbd } from "@/components/ui/kbd";
import { cn, toNameSlug } from "@/lib/utils";
import type { CardSearchResult } from "@/lib/search/card-search";
import { translateAndSearch } from "@/app/_actions/search-ai-stub";
import CardTile from "@/app/_components/card/card-tile";
import { SearchControlPanel, type SearchMode } from "./search-control-panel";

// ── Types ─────────────────────────────────────────────────────────────────────

const MANA_COLORS = ["W", "U", "B", "R", "G"] as const;
const CARD_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Planeswalker",
  "Land",
] as const;

const MANA_SWATCH: Record<string, string> = {
  W: "bg-[#f8f0d1] border-[#d8c98a] text-[#7a6c3a]",
  U: "bg-[#0e68ab] border-[#0a4f81] text-white",
  B: "bg-[#1a1512] border-[#000] text-white",
  R: "bg-[#d3202a] border-[#9b1820] text-white",
  G: "bg-[#00733e] border-[#005529] text-white",
};


// ── Props ─────────────────────────────────────────────────────────────────────

interface SearchFormProps {
  initialQuery: string;
  initialMode: SearchMode;
  initialColors: string[];
  initialTypes: string[];
  initialResults: CardSearchResult[];
  initialCount: number;
  isDefault?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SearchForm({
  initialQuery,
  initialMode,
  initialColors,
  initialTypes,
  initialResults,
  initialCount,
  isDefault = false,
}: SearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [aiResults, setAiResults] = useState<CardSearchResult[]>([]);
  const [aiTranslated, setAiTranslated] = useState("");
  const [isPending, startTransition] = useTransition();
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery);

  if (initialQuery !== prevInitialQuery) {
    setPrevInitialQuery(initialQuery);
    setQuery(initialQuery);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const limit = 60;

  // Sync URL when non-AI search changes
  const pushUrl = useCallback(
    (q: string, m: SearchMode, c: string[], t: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set("q", q); else params.delete("q");
      if (m !== "simple") params.set("mode", m); else params.delete("mode");
      if (c.length) params.set("colors", c.join("")); else params.delete("colors");
      if (t.length) params.set("types", t.join(",")); else params.delete("types");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // "/" keybinding — focus input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && e.target === document.body) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleColor(c: string) {
    const next = initialColors.includes(c)
      ? initialColors.filter((x) => x !== c)
      : [...initialColors, c];
    pushUrl(query, initialMode, next, initialTypes);
  }

  function toggleType(t: string) {
    const next = initialTypes.includes(t)
      ? initialTypes.filter((x) => x !== t)
      : [...initialTypes, t];
    pushUrl(query, initialMode, initialColors, next);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setAiTranslated("");
  }

  function handleModeChange(m: SearchMode) {
    setAiTranslated("");
    pushUrl(query, m, initialColors, initialTypes);
  }

  // For simple/syntax modes: trigger server re-fetch via URL; parent RSC handles it.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (initialMode === "ai") return;
    pushUrl(query, initialMode, initialColors, initialTypes);
  }

  // AI translation — calls the server action stub
  function handleTranslate() {
    if (!query.trim() || isPending) return;
    startTransition(async () => {
      const { syntax, results } = await translateAndSearch(query);
      setAiTranslated(syntax);
      setAiResults(results);
    });
  }

  function acceptTranslation() {
    setQuery(aiTranslated);
    setAiTranslated("");
    pushUrl(aiTranslated, "syntax", initialColors, initialTypes);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function showMore() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit * 2));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const displayResults =
    initialMode === "ai" ? (aiTranslated ? aiResults : []) : initialResults;
  const displayCount = initialMode === "ai" ? aiResults.length : initialCount;

  return (
    <div>
      <SearchControlPanel
        initialMode={initialMode}
        query={query}
        inputRef={inputRef}
        isPending={isPending}
        aiTranslated={aiTranslated}
        onModeChange={handleModeChange}
        onQueryChange={handleQueryChange}
        onSubmit={handleSubmit}
        onTranslate={handleTranslate}
        onAcceptTranslation={acceptTranslation}
        onClearTranslation={() => setAiTranslated("")}
      />

      {/* Filter rail */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 pb-5 mb-7 border-b border-border">
        {/* Color chips */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
            Color
          </span>
          {MANA_COLORS.map((c) => {
            const active = initialColors.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleColor(c)}
                aria-pressed={active}
                aria-label={`Filter by ${c}`}
                className={cn(
                  "size-7 rounded-full border-[1.5px] font-mono text-[11px] font-semibold transition-opacity",
                  MANA_SWATCH[c],
                  active ? "opacity-100 ring-2 ring-primary ring-offset-1" : "opacity-55",
                )}
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* Type chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
            Type
          </span>
          {CARD_TYPES.map((t) => {
            const active = initialTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                aria-pressed={active}
                className={cn(
                  "h-[26px] px-2.5 text-xs rounded border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary font-semibold"
                    : "bg-card border-border text-foreground hover:bg-muted",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results header */}
      <div className="flex justify-between items-baseline mb-4">
        <Eyebrow>
          {initialMode === "ai" && !aiTranslated ? "Waiting for prompt" : `${displayCount} result${displayCount !== 1 ? "s" : ""}`}
        </Eyebrow>
        <span className="font-mono text-[11px] text-muted-foreground/60">
          {isDefault
            ? "showing popular cards — search to filter"
            : initialMode === "syntax"
              ? "scryfall-syntax mode"
              : initialMode === "ai"
                ? "natural language → syntax"
                : "sorted by relevance"}
        </span>
      </div>

      {/* Results grid or AI empty state */}
      {initialMode === "ai" && !aiTranslated ? (
        <div className="flex flex-col items-center gap-2 border border-dashed border-border rounded p-12 text-center text-muted-foreground">
          <svg
            className="size-5 text-primary mb-1"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
          </svg>
          <p className="text-sm">
            Type a description above, press <Kbd>⏎</Kbd> to translate.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Accept the syntax to run the search.
          </p>
        </div>
      ) : displayResults.length === 0 && (query.trim() || initialColors.length || initialTypes.length) ? (
        <p className="text-muted-foreground text-sm">
          No cards found. Try broadening your search.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {displayResults.map((card) => (
              <CardTile
                key={card.id}
                id={String(card.id)}
                name={card.name}
                thumbnailUrl={card.imageUri}
                heroUrl={card.imageUri}
                href={`/card/${toNameSlug(card.name)}`}
                gameChanger={card.gameChanger}
              />
            ))}
          </div>
          {displayCount >= limit && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={showMore}
                className="h-9 px-5 rounded border border-border bg-card text-sm hover:bg-muted transition-colors"
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
