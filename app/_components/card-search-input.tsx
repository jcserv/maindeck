"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { type CardSearchResult } from "@/lib/search/card-search";
import { ManaCost } from "@/app/_components/mana-cost";
import { toNameSlug } from "@/lib/utils";

interface CardSearchInputProps {
  autoFocus?: boolean;
  onClose?: () => void;
}

export function CardSearchInput({ autoFocus, onClose }: CardSearchInputProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Pre-fetch loading flag is owned by the input change handler so we don't
  // set state synchronously inside the fetch effect.
  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim()) setIsLoading(true);
  }

  // Fetch results when debounced query changes. State is only set asynchronously
  // (after fetch resolves) — empty/stale states are derived in render below.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) return;

    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as CardSearchResult[];
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery]);

  // Derived: when query is empty/whitespace, show empty state regardless of stale results.
  const trimmed = debouncedQuery.trim();
  const displayResults = trimmed ? results : [];
  const showLoading = trimmed && isLoading;

  // `/` shortcut on desktop to focus the input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only activate the "/" shortcut on desktop (md breakpoint: 768px+)
      if (
        e.key === "/" &&
        window.innerWidth >= 768 &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSelect(card: CardSearchResult) {
    router.push(`/card/${toNameSlug(card.name)}`);
    onClose?.();
  }

  return (
    <Command shouldFilter={false} className="rounded-xl border shadow-md">
      <CommandInput
        ref={inputRef}
        placeholder="Search cards..."
        value={query}
        onValueChange={handleQueryChange}
        autoFocus={autoFocus}
      />
      <CommandList>
        {!trimmed && (
          <CommandEmpty>Start typing to search...</CommandEmpty>
        )}
        {showLoading && (
          <CommandEmpty>Searching...</CommandEmpty>
        )}
        {trimmed && !isLoading && displayResults.length === 0 && (
          <CommandEmpty>No cards found.</CommandEmpty>
        )}
        {displayResults.length > 0 && (
          <CommandGroup heading="Cards">
            {displayResults.map((card) => (
              <CommandItem
                key={card.id}
                value={String(card.id)}
                onSelect={() => handleSelect(card)}
                className="flex items-center justify-between gap-3 py-2.5 min-h-11"
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
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
