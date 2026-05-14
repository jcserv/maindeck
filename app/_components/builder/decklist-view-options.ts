"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  readCollapsed,
  subscribeCollapsed,
  writeCollapsed,
} from "./decklist-collapsed";

export type DeckViewOptionKey = "manaValues" | "price" | "ownership";

export interface DeckViewOptions {
  manaValues: boolean;
  price: boolean;
  ownership: boolean;
}

export const DEFAULT_DECK_VIEW_OPTIONS: DeckViewOptions = {
  manaValues: true,
  price: false,
  ownership: false,
};

const EMPTY_MAP: Record<string, boolean> = {};

function viewOptionsFromMap(map: Record<string, boolean>): DeckViewOptions {
  return {
    manaValues: map["manaValues"] ?? DEFAULT_DECK_VIEW_OPTIONS.manaValues,
    price: map["price"] ?? DEFAULT_DECK_VIEW_OPTIONS.price,
    ownership: map["ownership"] ?? DEFAULT_DECK_VIEW_OPTIONS.ownership,
  };
}

export function useDeckViewOptions(deckId: string) {
  const key = `decklist:view-options:${deckId}`;
  const subscribe = useCallback(
    (cb: () => void) => subscribeCollapsed(key, cb),
    [key],
  );
  const getSnapshot = useCallback(() => readCollapsed(key), [key]);
  /* v8 ignore next -- SSR snapshot; tests run under jsdom where the client snapshot is used. */
  const getServerSnapshot = useCallback(() => EMPTY_MAP, []);
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const options = useMemo(() => viewOptionsFromMap(map), [map]);
  const toggle = useCallback(
    (optionKey: DeckViewOptionKey) => {
      const current = viewOptionsFromMap(readCollapsed(key));
      const next: Record<string, boolean> = {
        ...current,
        [optionKey]: !current[optionKey],
      };
      writeCollapsed(key, next);
    },
    [key],
  );
  return { options, toggle };
}
