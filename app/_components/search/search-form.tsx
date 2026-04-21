"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Kbd } from "@/components/ui/kbd";
import { cn, toNameSlug } from "@/lib/utils";
import type { CardSearchResult } from "@/lib/search/card-search";
import { translateAndSearch } from "@/app/_actions/search-ai-stub";
import CardTile from "@/app/_components/card-tile";

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchMode = "simple" | "syntax" | "ai";

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

// const AI_SUGGESTIONS = [
//   "Cheap green ramp",
//   "Blue counters under 3",
//   "White angel tribal",
//   "Instant-speed removal",
//   "Flash creatures",
// ];

const PLACEHOLDER: Record<SearchMode, string> = {
  simple: "Name, text, mechanic…",
  syntax: 'c:wu t:creature cmc<=3 o:"flying"',
  ai: 'Describe what you want — e.g. "cheap green ramp under 3 mana"',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface SearchFormProps {
  initialQuery: string;
  initialMode: SearchMode;
  initialColors: string[];
  initialTypes: string[];
  initialResults: CardSearchResult[];
  initialCount: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SearchForm({
  initialQuery,
  initialMode,
  initialColors,
  initialTypes,
  initialResults,
  initialCount,
}: SearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [aiResults, setAiResults] = useState<CardSearchResult[]>([]);
  const [aiTranslated, setAiTranslated] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

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
      {/* Search control */}
      <div
        className={cn(
          "relative mb-3.5 rounded border transition-colors duration-150",
          initialMode === "ai"
            ? "border-primary bg-primary/5"
            : "border-border bg-card",
        )}
      >
        {/* Mode tabs */}
        <div className="flex items-center gap-0.5 border-b border-border px-3 h-8">
          {(
            [
              { v: "simple" as const, label: "Simple", accent: false },
              { v: "syntax" as const, label: "Scryfall syntax", accent: false },
              // { v: "ai" as const, label: "Ask AI", accent: true },
            ]
          ).map(({ v, label, accent }) => {
            const active = initialMode === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => handleModeChange(v)}
                className={cn(
                  "inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2.5 text-[11.5px] font-medium transition-colors",
                  active
                    ? accent
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={active}
              >
                {accent && (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
                  </svg>
                )}
                {label}
              </button>
            );
          })}
          <span className="flex-1" />
          <span className="font-mono text-[10.5px] text-muted-foreground/60 tracking-wide px-1.5">
            <Kbd>/</Kbd> to focus
          </span>
        </div>

        {/* Input row */}
        <form onSubmit={handleSubmit} className="relative">
          <svg
            className={cn(
              "absolute left-3.5 top-1/2 -translate-y-1/2 size-4",
              initialMode === "ai" ? "text-primary" : "text-muted-foreground",
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            {initialMode === "ai" ? (
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
            ) : initialMode === "syntax" ? (
              <>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </>
            ) : (
              <>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </>
            )}
          </svg>
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (initialMode === "ai" && e.key === "Enter" && query.trim() && !isPending) {
                e.preventDefault();
                handleTranslate();
              }
            }}
            placeholder={PLACEHOLDER[initialMode]}
            className={cn(
              "w-full h-12 bg-transparent pl-10 pr-3 text-sm outline-none",
              initialMode === "syntax" && "font-mono text-[13.5px]",
            )}
            aria-label={`Search — ${initialMode} mode`}
          />
          {/* AI translate button */}
          {initialMode === "ai" && !aiTranslated && !isPending && query.trim() && (
            <button
              type="button"
              onClick={handleTranslate}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-primary text-primary-foreground text-[11.5px] font-semibold"
            >
              Translate
              <Kbd className="bg-primary-foreground text-primary border-transparent">⏎</Kbd>
            </button>
          )}
          {/* AI thinking */}
          {initialMode === "ai" && isPending && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-primary flex items-center gap-1.5">
              <span
                className="inline-block size-1.5 rounded-full bg-current animate-pulse"
                aria-hidden
              />
              thinking…
            </span>
          )}
        </form>

        {/* AI translated syntax row */}
        {initialMode === "ai" && aiTranslated && (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-border bg-card px-3.5 py-2.5">
            <span className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">
              → Scryfall
            </span>
            <code className="flex-1 min-w-0 font-mono text-[12.5px] bg-muted px-2.5 py-1 rounded border border-border truncate">
              {aiTranslated}
            </code>
            <button
              type="button"
              onClick={() => setAiTranslated("")}
              className="h-7 px-2.5 text-[11.5px] rounded border border-border bg-card hover:bg-muted transition-colors"
            >
              Refine prompt
            </button>
            <button
              type="button"
              onClick={acceptTranslation}
              className="h-7 px-2.5 text-[11.5px] rounded bg-primary text-primary-foreground font-semibold inline-flex items-center gap-1.5"
            >
              Use query <Kbd className="bg-primary-foreground text-primary border-transparent">⏎</Kbd>
            </button>
          </div>
        )}

      </div>

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
          {initialMode === "syntax"
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
