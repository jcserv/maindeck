"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveRetryAfterMs } from "@/app/_components/header-search/retry-after";
import type { CardSearchResult } from "@/lib/search/card-search";

const PAGE_SIZE = 60;

interface UseEdhrecCardsState {
  results: CardSearchResult[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  count: number;
  error: string | null;
  showMore: () => void;
}

/**
 * Fetches commander suggestions from `/api/cards/edhrec?commander=<slug>` once
 * per slug, then reveals them in `PAGE_SIZE` windows via `showMore` so the grid
 * mirrors the Scryfall browse hook's shape without paginating the network call.
 * Disabled (no slug / not active) renders empty without fetching. Backs off on a
 * 429 via `Retry-After`; a failed/slow upstream surfaces as an error state and
 * never blocks the UI.
 */
export function useEdhrecCards(
  slug: string | null,
  active: boolean,
): UseEdhrecCardsState {
  const [all, setAll] = useState<CardSearchResult[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const enabled = active && !!slug;

  // Reset the window whenever the effective query changes.
  const key = enabled ? slug : "";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setVisible(PAGE_SIZE);
    setError(null);
    setAll([]);
    setLoading(enabled);
  }

  // Guards stale resolutions when the slug changes mid-flight.
  const reqId = useRef(0);

  useEffect(() => {
    reqId.current++;
    const id = reqId.current;
    if (!enabled || !slug) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const res = await fetch(
          `/api/cards/edhrec?commander=${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );
        if (id !== reqId.current) return;
        if (!res.ok) {
          if (res.status === 429) {
            setError("Too many requests — retrying…");
            setLoading(false);
            retryTimer = setTimeout(
              () => setRetryNonce((n) => n + 1),
              resolveRetryAfterMs(res.headers.get("Retry-After")),
            );
            return;
          }
          setError(
            res.status === 502
              ? "EDHREC is unavailable right now. Try again shortly."
              : "Couldn't load EDHREC suggestions.",
          );
          setAll([]);
          setLoading(false);
          return;
        }
        const data: unknown = await res.json();
        if (id !== reqId.current) return;
        setAll(Array.isArray(data) ? (data as CardSearchResult[]) : []);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (id !== reqId.current) return;
        if ((e as Error)?.name === "AbortError") return;
        setError("Couldn't load EDHREC suggestions.");
        setAll([]);
        setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, slug, retryNonce]);

  const showMore = useCallback(() => {
    setVisible((v) => v + PAGE_SIZE);
  }, []);

  const results = all.slice(0, visible);
  return {
    results,
    loading,
    loadingMore: false,
    hasMore: visible < all.length,
    count: all.length,
    error,
    showMore,
  };
}
