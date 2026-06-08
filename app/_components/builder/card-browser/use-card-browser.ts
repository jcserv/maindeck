"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveRetryAfterMs } from "@/app/_components/header-search/retry-after";
import type { CardSearchResult } from "@/lib/search/card-search";

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 60;

interface UseCardBrowserState {
  results: CardSearchResult[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  count: number;
  error: string | null;
  showMore: () => void;
}

/**
 * Fetches `/api/cards/browse?q=` for the browser surfaces. Debounces the raw
 * syntax query, gates on a non-empty query (empty never hits the table), backs
 * off on 429 via `Retry-After`, and paginates with `showMore`. Page-one fetches
 * replace results; `showMore` appends. Mirrors the header-search hook's
 * abort/back-off behaviour.
 */
export function useCardBrowser(raw: string): UseCardBrowserState {
  const [debounced, setDebounced] = useState(raw);
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const query = debounced.trim();
  const active = query.length > 0;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [raw]);

  // Sync loading/results during render when the debounced query changes — keeps
  // the fetch effect free of synchronous setState. Mirrors the header-search hook.
  const [prev, setPrev] = useState(debounced);
  if (debounced !== prev) {
    setPrev(debounced);
    setOffset(0);
    setHasMore(false);
    setError(null);
    if (active) {
      setLoading(true);
    } else {
      setResults([]);
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
          `/api/cards/browse?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=0`,
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
          setHasMore(false);
          return;
        }
        const data: unknown = await res.json();
        if (cancelled) return;
        const items = Array.isArray(data) ? (data as CardSearchResult[]) : [];
        setResults(items);
        setOffset(items.length);
        setHasMore(items.length === PAGE_SIZE);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        if ((e as Error)?.name === "AbortError") return;
        setError("Search failed. Try again.");
        setResults([]);
        setLoading(false);
        setHasMore(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [query, active, retryNonce]);

  const showMore = useCallback(() => {
    if (!active || !hasMore || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/cards/browse?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}`,
        );
        const data: unknown = await res.json();
        const items = Array.isArray(data) ? (data as CardSearchResult[]) : [];
        setResults((prev) => [...prev, ...items]);
        setOffset((o) => o + items.length);
        setHasMore(items.length === PAGE_SIZE);
      } catch {
        setHasMore(false);
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [active, hasMore, loadingMore, query, offset]);

  return {
    results,
    loading,
    loadingMore,
    hasMore,
    count: results.length,
    error,
    showMore,
  };
}
