"use client";

import type { RefObject } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export type SearchMode = "simple" | "syntax" | "ai";

const PLACEHOLDER: Record<SearchMode, string> = {
  simple: "Name, text, mechanic…",
  syntax: 'c:wu t:creature cmc<=3 o:"flying"',
  ai: 'Describe what you want — e.g. "cheap green ramp under 3 mana"',
};

const TABS: ReadonlyArray<{
  v: SearchMode;
  label: string;
  accent: boolean;
}> = [
  { v: "simple", label: "Simple", accent: false },
  { v: "syntax", label: "Scryfall syntax", accent: false },
];

interface SearchControlPanelProps {
  initialMode: SearchMode;
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isPending: boolean;
  aiTranslated: string;
  onModeChange: (m: SearchMode) => void;
  onQueryChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onTranslate: () => void;
  onAcceptTranslation: () => void;
  onClearTranslation: () => void;
}

function ModeIcon({ mode }: { mode: SearchMode }) {
  const className = cn(
    "absolute left-3.5 top-1/2 -translate-y-1/2 size-4",
    mode === "ai" ? "text-primary" : "text-muted-foreground",
  );
  if (mode === "ai") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
      </svg>
    );
  }
  if (mode === "syntax") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ModeTabs({
  initialMode,
  onModeChange,
}: {
  initialMode: SearchMode;
  onModeChange: (m: SearchMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border px-3 h-8">
      {TABS.map(({ v, label, accent }) => {
        const active = initialMode === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onModeChange(v)}
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
            {label}
          </button>
        );
      })}
      <span className="flex-1" />
      <span className="font-mono text-[10.5px] text-muted-foreground/60 tracking-wide px-1.5">
        <Kbd>/</Kbd> to focus
      </span>
    </div>
  );
}

function AiTranslationRow({
  aiTranslated,
  onAcceptTranslation,
  onClearTranslation,
}: {
  aiTranslated: string;
  onAcceptTranslation: () => void;
  onClearTranslation: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-border bg-card px-3.5 py-2.5">
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">
        → Scryfall
      </span>
      <code className="flex-1 min-w-0 font-mono text-[12.5px] bg-muted px-2.5 py-1 rounded border border-border truncate">
        {aiTranslated}
      </code>
      <button
        type="button"
        onClick={onClearTranslation}
        className="h-7 px-2.5 text-[11.5px] rounded border border-border bg-card hover:bg-muted transition-colors"
      >
        Refine prompt
      </button>
      <button
        type="button"
        onClick={onAcceptTranslation}
        className="h-7 px-2.5 text-[11.5px] rounded bg-primary text-primary-foreground font-semibold inline-flex items-center gap-1.5"
      >
        Use query <Kbd className="bg-primary-foreground text-primary border-transparent">⏎</Kbd>
      </button>
    </div>
  );
}

export function SearchControlPanel({
  initialMode,
  query,
  inputRef,
  isPending,
  aiTranslated,
  onModeChange,
  onQueryChange,
  onSubmit,
  onTranslate,
  onAcceptTranslation,
  onClearTranslation,
}: SearchControlPanelProps) {
  const isAi = initialMode === "ai";
  const showTranslateBtn = isAi && !aiTranslated && !isPending && query.trim();
  return (
    <div
      className={cn(
        "relative mb-3.5 rounded border transition-colors duration-150",
        isAi ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <ModeTabs initialMode={initialMode} onModeChange={onModeChange} />

      <form onSubmit={onSubmit} className="relative">
        <ModeIcon mode={initialMode} />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (isAi && e.key === "Enter" && query.trim() && !isPending) {
              e.preventDefault();
              onTranslate();
            }
          }}
          placeholder={PLACEHOLDER[initialMode]}
          className={cn(
            "w-full h-12 bg-transparent pl-10 pr-3 text-sm outline-none",
            initialMode === "syntax" && "font-mono text-[13.5px]",
          )}
          aria-label={`Search — ${initialMode} mode`}
        />
        {showTranslateBtn && (
          <button
            type="button"
            onClick={onTranslate}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-primary text-primary-foreground text-[11.5px] font-semibold"
          >
            Translate
            <Kbd className="bg-primary-foreground text-primary border-transparent">⏎</Kbd>
          </button>
        )}
        {isAi && isPending && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-primary flex items-center gap-1.5">
            <span
              className="inline-block size-1.5 rounded-full bg-current animate-pulse"
              aria-hidden
            />
            thinking…
          </span>
        )}
      </form>

      {isAi && aiTranslated && (
        <AiTranslationRow
          aiTranslated={aiTranslated}
          onAcceptTranslation={onAcceptTranslation}
          onClearTranslation={onClearTranslation}
        />
      )}
    </div>
  );
}
