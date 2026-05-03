"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  matchDeckCards,
  type DeckMatchResult,
} from "@/app/_components/deck-search-matcher";
import type { Format } from "@/lib/generated/prisma/enums";
import type { DeckCard } from "@/lib/deck/zone-view";

interface DeckSearchMeta {
  cards: DeckCard[];
  categories: string[];
  format: Format;
}

const EMPTY_META: DeckSearchMeta = {
  cards: [],
  categories: [],
  format: "CASUAL" as Format,
};

interface DeckSearchContextValue {
  query: string;
  setQuery: (q: string) => void;
  meta: DeckSearchMeta;
  registerMeta: (meta: DeckSearchMeta) => void;
  matchIds: Set<string>;
  ranked: DeckCard[];
  scrollToId: string | null;
  requestScrollTo: (id: string) => void;
  consumeScrollTo: () => void;
  reset: () => void;
}

const DeckSearchContext = createContext<DeckSearchContextValue | null>(null);

export function useDeckSearch(): DeckSearchContextValue | null {
  return useContext(DeckSearchContext);
}

export function DeckSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [meta, setMeta] = useState<DeckSearchMeta>(EMPTY_META);
  const [scrollToId, setScrollToId] = useState<string | null>(null);

  const registerMeta = useCallback((next: DeckSearchMeta) => {
    setMeta(next);
  }, []);

  const requestScrollTo = useCallback((id: string) => {
    setScrollToId(id);
  }, []);

  const consumeScrollTo = useCallback(() => {
    setScrollToId(null);
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    setScrollToId(null);
    setMeta(EMPTY_META);
  }, []);

  const { ids, ranked }: DeckMatchResult = useMemo(
    () => matchDeckCards(meta.cards, query),
    [meta.cards, query],
  );

  const value = useMemo<DeckSearchContextValue>(
    () => ({
      query,
      setQuery,
      meta,
      registerMeta,
      matchIds: ids,
      ranked,
      scrollToId,
      requestScrollTo,
      consumeScrollTo,
      reset,
    }),
    [
      query,
      meta,
      registerMeta,
      ids,
      ranked,
      scrollToId,
      requestScrollTo,
      consumeScrollTo,
      reset,
    ],
  );

  return (
    <DeckSearchContext.Provider value={value}>
      {children}
    </DeckSearchContext.Provider>
  );
}

/**
 * Publishes the current deck's cards, categories, and format to the search
 * provider (which lives at the layout level alongside the header). Resets the
 * provider when the deck unmounts.
 */
export function DeckSearchCardsBridge({
  cards,
  categories,
  format,
}: {
  cards: DeckCard[];
  categories: string[];
  format: Format;
}) {
  const ctx = useDeckSearch();
  const reset = ctx?.reset;
  const registerMeta = ctx?.registerMeta;
  useEffect(() => {
    registerMeta?.({ cards, categories, format });
  }, [registerMeta, cards, categories, format]);
  useEffect(() => {
    return () => reset?.();
  }, [reset]);
  return null;
}
