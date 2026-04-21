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

interface ExploreFilterProps {
  q: string;
  format: Format | null;
  colors: string[];
  commander: string;
}

export function ExploreFilter({
  q: initialQ,
  format,
  colors,
  commander: initialCommander,
}: ExploreFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initialQ);
  const [commander, setCommander] = useState(initialCommander);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  useEffect(() => {
    setCommander(initialCommander);
  }, [initialCommander]);

  const pushUrl = useCallback(
    (next: {
      q?: string;
      format?: Format | null;
      colors?: string[];
      commander?: string;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      if ("q" in next) {
        if (next.q) params.set("q", next.q);
        else params.delete("q");
      }
      if ("format" in next) {
        if (next.format) params.set("format", next.format);
        else params.delete("format");
        if (next.format !== "COMMANDER") params.delete("commander");
      }
      if ("colors" in next) {
        if (next.colors && next.colors.length > 0)
          params.set("colors", next.colors.join(""));
        else params.delete("colors");
      }
      if ("commander" in next) {
        if (next.commander) params.set("commander", next.commander);
        else params.delete("commander");
      }

      params.delete("page");

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
      {/* Text inputs */}
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
      <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}
