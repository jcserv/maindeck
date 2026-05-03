"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeckCardPreview } from "@/app/_components/deck-card-preview";
import {
  loadMorePublicDecks,
  type ParsedFilters,
  type SerializedDeck,
} from "@/app/(ui)/decks/explore/actions";

interface ExploreInfiniteListProps {
  initialDecks: SerializedDeck[];
  total: number;
  pageSize: number;
  filters: ParsedFilters;
}

export function ExploreInfiniteList({
  initialDecks,
  total,
  pageSize,
  filters,
}: ExploreInfiniteListProps) {
  const [decks, setDecks] = useState<SerializedDeck[]>(initialDecks);
  const [nextPage, setNextPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialDecks.length < total);

  // Track the previous initialDecks reference so we can reset accumulated
  // pages whenever the server supplies a fresh first page (filter/URL change).
  const [prevInitialDecks, setPrevInitialDecks] = useState(initialDecks);
  if (prevInitialDecks !== initialDecks) {
    setPrevInitialDecks(initialDecks);
    setDecks(initialDecks);
    setNextPage(2);
    setHasMore(initialDecks.length < total);
  }

  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const result = await loadMorePublicDecks(filters, nextPage, pageSize);
      setDecks((prev) => [...prev, ...result.decks]);
      setNextPage((p) => p + 1);
      setHasMore(result.hasMore);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, filters, nextPage, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (decks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center h-[200px]">
        <p className="text-muted-foreground">
          No public decks match your filters.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {decks.map((deck) => (
          <DeckCardPreview
            key={deck.id}
            id={deck.id}
            name={deck.name}
            format={deck.format}
            visibility={deck.visibility}
            cardCount={deck.cardCount}
            updatedAt={deck.updatedAt}
            releasedAt={deck.releasedAt}
            previewImages={deck.previewImages}
            isOfficial={deck.isOfficial}
            commanderName={deck.commanderName}
          />
        ))}
      </div>

      {/* Sentinel: observed by IntersectionObserver to trigger next page load */}
      <div ref={sentinelRef} className="h-[20px]" aria-hidden />

      {loading && (
        <div
          className="flex items-center justify-center py-4 h-[48px]"
          role="status"
          aria-label="Loading more decks"
        >
          <span
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground"
            aria-hidden
          />
        </div>
      )}

      {!hasMore && !loading && (
        <p className="text-center py-4 font-mono text-[11.5px] uppercase tracking-[0.3px] text-muted-foreground/60">
          No more decks
        </p>
      )}
    </>
  );
}
