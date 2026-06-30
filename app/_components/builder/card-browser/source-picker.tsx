"use client";

import { cn } from "@/lib/utils";

/** Where the browser pulls cards from: the local card DB or EDHREC suggestions. */
export type BrowserSource = "scryfall" | "edhrec";

interface SourcePickerProps {
  source: BrowserSource;
  onSource: (source: BrowserSource) => void;
  /** EDHREC only applies to Commander decks with a commander set. */
  edhrecEnabled: boolean;
}

const SOURCES: ReadonlyArray<[BrowserSource, string]> = [
  ["scryfall", "Scryfall"],
  ["edhrec", "EDHREC"],
];

/** Data-source toggle shown above the search controls. */
export function SourcePicker({ source, onSource, edhrecEnabled }: SourcePickerProps) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
      role="tablist"
      aria-label="Card source"
    >
      {SOURCES.map(([value, label]) => {
        const active = source === value;
        const disabled = value === "edhrec" && !edhrecEnabled;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            title={
              disabled ? "EDHREC suggestions need a Commander deck with a commander" : undefined
            }
            onClick={() => onSource(value)}
            className={cn(
              "inline-flex h-[24px] items-center rounded px-2.5 text-xs transition-colors",
              active
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "font-medium text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
