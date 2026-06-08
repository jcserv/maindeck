"use client";

import { useHeaderSearch } from "@/app/_components/header-search/header-search-context";
import { SimpleBar } from "./simple-bar";
import { DeckModeBar } from "./deck-mode-bar";

export function HeaderSearchBar() {
  const { deckRoute } = useHeaderSearch();
  // deckRoute is null on the server and on the first client render (it is
  // seeded by DeckRouteBridge's layout effect), so SSR and hydration both
  // render SimpleBar — no mismatch. The layout effect then sets deckRoute
  // before paint, so DeckModeBar (and its owner controls) appears on the
  // first visible frame rather than a frame later.
  if (deckRoute) {
    return <DeckModeBar key={deckRoute.deckId} deckRoute={deckRoute} />;
  }
  return <SimpleBar />;
}
