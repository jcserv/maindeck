"use client";

import { cn } from "@/lib/utils";

export type BrowserMode = "filters" | "syntax";

interface ModeTabsProps {
  mode: BrowserMode;
  onMode: (mode: BrowserMode) => void;
  activeCount: number;
}

const TABS: ReadonlyArray<[BrowserMode, string]> = [
  ["filters", "Filters"],
  ["syntax", "Scryfall syntax"],
];

export function ModeTabs({ mode, onMode, activeCount }: ModeTabsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {TABS.map(([value, label]) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onMode(value)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
              active
                ? "bg-muted font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {value === "filters" && activeCount > 0 && (
              <span className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-foreground px-1 font-mono text-[10px] text-background">
                {activeCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
