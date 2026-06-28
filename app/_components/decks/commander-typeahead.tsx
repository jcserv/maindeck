"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { cn } from "@/lib/utils";
import { useCardSearch } from "@/app/_components/header-search/use-card-search";

const COMMIT_DEBOUNCE_MS = 250;

interface CommanderTypeaheadProps {
  /** The committed commander filter (mirrors the URL param). */
  value: string;
  /** Commit a new commander filter — plaintext on debounce, exact name on pick. */
  onChange: (next: string) => void;
}

/**
 * Commander filter input with a Scryfall-backed typeahead. Suggestions are
 * sourced from the same `/api/cards/search` endpoint the header search uses, so
 * debounce, abort, and 429 back-off come for free via {@link useCardSearch}.
 *
 * Plaintext still works: free text commits on a {@link COMMIT_DEBOUNCE_MS}
 * debounce. Picking a suggestion commits its exact name immediately, which the
 * server resolves to a precise commander-zone match.
 */
export function CommanderTypeahead({ value, onChange }: CommanderTypeaheadProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Re-seed local input when the committed value changes from outside (e.g. the
  // URL is edited or the filter is cleared elsewhere).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInput(value);
  }

  const { results, loading } = useCardSearch(input, { enabled: open });

  // Reset the keyboard cursor whenever a fresh result set lands.
  const [prevResults, setPrevResults] = useState(results);
  if (results !== prevResults) {
    setPrevResults(results);
    setActiveIndex(-1);
  }

  // Debounce plaintext commits so typing filters without picking a suggestion.
  useEffect(() => {
    if (input === value) return;
    const id = setTimeout(() => onChange(input), COMMIT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input, value, onChange]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function pick(name: string) {
    setInput(name);
    onChange(name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (results.length) setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length)
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      const card = results[activeIndex];
      if (open && card) {
        e.preventDefault();
        pick(card.name);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  const showPanel = open && (loading || results.length > 0);

  return (
    <div ref={rootRef} className="relative w-full sm:w-60">
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
        aria-hidden
      />
      <Input
        type="search"
        placeholder="Commander name…"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="pl-8"
        aria-label="Filter by commander name"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Commander suggestions"
          className="absolute inset-x-0 top-full mt-2 z-50 rounded-xl border bg-popover shadow-lg overflow-hidden"
        >
          <div className="max-h-72 overflow-y-auto p-1">
            {loading && results.length === 0 && (
              <div className="py-3 px-3 text-sm text-muted-foreground">
                Searching…
              </div>
            )}
            {results.map((card, idx) => (
              <button
                key={card.id}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => pick(card.name)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm min-h-10",
                  idx === activeIndex && "bg-muted",
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{card.name}</span>
                  {card.typeLine && (
                    <span className="text-xs text-muted-foreground truncate">
                      {card.typeLine}
                    </span>
                  )}
                </div>
                {card.manaCost && (
                  <ManaCost cost={card.manaCost} className="shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
