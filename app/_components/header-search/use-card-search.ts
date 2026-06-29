"use client";

import { useEffect, useState } from "react";
import { parseAddCardInput } from "@/lib/deck/add-intent";
import type { CardSearchResult } from "@/lib/search/card-search";
import { resolveRetryAfterMs } from "./retry-after";

const DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

interface UseCardSearchOptions {
  /** When false the hook stays idle — no debounce-driven fetch. Defaults true. */
  enabled?: boolean;
  /** Restrict suggestions to commander-eligible cards (adds `&commander=1`). */
  commanderOnly?: boolean;
}

interface UseCardSearchState {
  /**
   * The debounced, prefix-stripped term actually being searched. Empty until a
   * term clears the {@link MIN_SEARCH_LENGTH} gate, so callers can key
   * pagination/reset logic off it.
   */
  term: string;
  results: CardSearchResult[];
  loading: boolean;
  error: string | null;
}

/**
 * Shared card-search behaviour for the header search bars: debounce, a
 * min-length gate (so single-char terms neither fetch nor spin), and a 429
 * back-off that reads `Retry-After` and auto-retries the same term once the
 * cooldown elapses. The in-flight request is aborted when the term changes or
 * the consumer unmounts.
 *
 * Returns page-one results only; surfaces that paginate own their own
 * offset/append state and key it off {@link UseCardSearchState.term}.
 */
export function useCardSearch(
  query: string,
  options: UseCardSearchOptions = {},
): UseCardSearchState {
  const enabled = options.enabled ?? true;
  const commanderOnly = options.commanderOnly ?? false;
  const [debounced, setDebounced] = useState(query);
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const parsed = enabled ? parseAddCardInput(debounced).term : "";
  const active = parsed.length >= MIN_SEARCH_LENGTH;
  // Only expose a term once it clears the gate, so consumers can key
  // pagination/reset off a value that always reflects a real search.
  const term = active ? parsed : "";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Sync loading/results during render so the spinner reflects the pending term
  // immediately, without a setState-in-effect round-trip. The effect below runs
  // the actual fetch.
  const [prev, setPrev] = useState({ debounced, enabled });
  if (debounced !== prev.debounced || enabled !== prev.enabled) {
    setPrev({ debounced, enabled });
    if (active) {
      setError(null);
      setLoading(true);
    } else {
      setResults([]);
      setError(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(term)}&offset=0${
            commanderOnly ? "&commander=1" : ""
          }`,
          { signal: controller.signal },
        );
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 429) {
            setError("Too many searches — retrying…");
            setLoading(false);
            retryTimer = setTimeout(
              () => setRetryNonce((n) => n + 1),
              resolveRetryAfterMs(res.headers.get("Retry-After")),
            );
            return;
          }
          setError("Search failed. Try again.");
          setResults([]);
          setLoading(false);
          return;
        }
        const data: unknown = await res.json();
        if (cancelled) return;
        setResults(Array.isArray(data) ? (data as CardSearchResult[]) : []);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        if ((e as Error)?.name === "AbortError") return;
        setError("Search failed. Try again.");
        setResults([]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [term, active, retryNonce, commanderOnly]);

  return { term, results, loading, error };
}
