"use client";

import { useSyncExternalStore } from "react";
import { useHeaderSearch } from "@/app/_components/header-search-context";
import { SimpleBar } from "./header-search/simple-bar";
import { DeckModeBar } from "./header-search/deck-mode-bar";

const noopSubscribe = () => () => {};

export function HeaderSearchBar() {
  const { deckRoute } = useHeaderSearch();
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (hydrated && deckRoute) {
    return <DeckModeBar key={deckRoute.deckId} deckRoute={deckRoute} />;
  }
  return <SimpleBar />;
}
