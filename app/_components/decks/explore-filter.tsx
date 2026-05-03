"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Format } from "@/lib/generated/prisma/enums";

const MANA_COLORS = ["W", "U", "B", "R", "G"] as const;

const MANA_SWATCH: Record<string, string> = {
  W: "bg-[#f8f0d1] border-[#d8c98a] text-[#7a6c3a]",
  U: "bg-[#0e68ab] border-[#0a4f81] text-white",
  B: "bg-[#1a1512] border-[#000] text-white",
  R: "bg-[#d3202a] border-[#9b1820] text-white",
  G: "bg-[#00733e] border-[#005529] text-white",
};

const FORMAT_VALUES = Object.values(Format) as Format[];

function formatLabel(format: Format): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "community", label: "Community" },
  { value: "official", label: "Official" },
] as const;

type SourceFilter = "all" | "community" | "official";

const SORT_OPTIONS = [
  { value: "updated", label: "Recent activity" },
  { value: "created", label: "Newly created" },
  { value: "released", label: "Recently released" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

interface ExploreFilterProps {
  q: string;
  format: Format | null;
  colors: string[];
  commander: string;
  source: SourceFilter;
  sort: SortOption;
}

type ExploreFilterPatch = {
  q?: string;
  format?: Format | null;
  colors?: string[];
  commander?: string;
  source?: SourceFilter;
  sort?: SortOption;
};

function setOrDelete(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

function applyExploreFilterPatch(
  searchParams: URLSearchParams | ReturnType<typeof useSearchParams>,
  next: ExploreFilterPatch,
): URLSearchParams {
  const params = new URLSearchParams(searchParams.toString());
  if ("q" in next) setOrDelete(params, "q", next.q);
  if ("format" in next) {
    setOrDelete(params, "format", next.format ?? undefined);
    if (next.format !== "COMMANDER") params.delete("commander");
  }
  if ("colors" in next) {
    setOrDelete(params, "colors", next.colors?.length ? next.colors.join("") : undefined);
  }
  if ("commander" in next) setOrDelete(params, "commander", next.commander);
  if ("source" in next) {
    setOrDelete(params, "source", next.source && next.source !== "all" ? next.source : undefined);
  }
  if ("sort" in next) {
    setOrDelete(params, "sort", next.sort && next.sort !== "updated" ? next.sort : undefined);
  }
  params.delete("page");
  return params;
}

export function ExploreFilter({
  q: initialQ,
  format,
  colors,
  commander: initialCommander,
  source,
  sort,
}: ExploreFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initialQ);
  const [commander, setCommander] = useState(initialCommander);
  const [prevInitialQ, setPrevInitialQ] = useState(initialQ);
  const [prevInitialCommander, setPrevInitialCommander] = useState(initialCommander);

  if (initialQ !== prevInitialQ) {
    setPrevInitialQ(initialQ);
    setQ(initialQ);
  }
  if (initialCommander !== prevInitialCommander) {
    setPrevInitialCommander(initialCommander);
    setCommander(initialCommander);
  }

  const pushUrl = useCallback(
    (next: ExploreFilterPatch) => {
      const params = applyExploreFilterPatch(searchParams, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Debounce name input
  useEffect(() => {
    if (q === initialQ) return;
    const id = setTimeout(() => pushUrl({ q }), 250);
    return () => clearTimeout(id);
  }, [q, initialQ, pushUrl]);

  // Debounce commander input
  useEffect(() => {
    if (commander === initialCommander) return;
    const id = setTimeout(() => pushUrl({ commander }), 250);
    return () => clearTimeout(id);
  }, [commander, initialCommander, pushUrl]);

  function toggleColor(c: string) {
    const next = colors.includes(c)
      ? colors.filter((x) => x !== c)
      : [...colors, c];
    pushUrl({ colors: next });
  }

  function toggleFormat(f: Format) {
    pushUrl({ format: format === f ? null : f });
  }

  const showCommander = format === "COMMANDER";

  return (
    <div className="mb-7 pb-5 border-b border-border">
      {/* Text inputs and sort */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full sm:w-60">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Filter decks by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
            aria-label="Filter decks by name"
          />
        </div>
        {showCommander && (
          <div className="relative w-full sm:w-60">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Commander name…"
              value={commander}
              onChange={(e) => setCommander(e.target.value)}
              className="pl-8"
              aria-label="Filter by commander name"
            />
          </div>
        )}
        <select
          value={sort}
          onChange={(e) => pushUrl({ sort: e.target.value as SortOption })}
          aria-label="Sort decks by"
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Format chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/60 mr-1">
          Format
        </span>
        {FORMAT_VALUES.map((f) => {
          const active = format === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => toggleFormat(f)}
              aria-pressed={active}
              className={cn(
                "h-[26px] px-2.5 text-xs rounded border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "bg-card border-border text-foreground hover:bg-muted",
              )}
            >
              {formatLabel(f)}
            </button>
          );
        })}
      </div>

      {/* Color chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/60 mr-1">
          Colors
        </span>
        {MANA_COLORS.map((c) => {
          const active = colors.includes(c);
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
                active
                  ? "opacity-100 ring-2 ring-primary ring-offset-1"
                  : "opacity-55",
              )}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Source chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/60 mr-1">
          Source
        </span>
        {SOURCE_OPTIONS.map(({ value, label }) => {
          const active = source === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => pushUrl({ source: value })}
              aria-pressed={active}
              className={cn(
                "h-[26px] px-2.5 text-xs rounded border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "bg-card border-border text-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
