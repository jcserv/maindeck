"use client";

import { useMemo, useState } from "react";
import { parseSyntax } from "@/lib/search/syntax-parser";
import type { Format } from "@/lib/generated/prisma/enums";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";
import { DeckBrowserProvider } from "./deck-browser-context";
import { useCardBrowser } from "./use-card-browser";
import { useMediaQuery } from "./use-media-query";
import { activeFilterCount } from "./filter-builder";
import type { BrowserState } from "./browser-state";
import type { BrowserMode } from "./mode-tabs";
import type { Density } from "./density-toggle";
import { SidePanel } from "./side-panel";
import { ScryTray } from "./scry-tray";

interface CardBrowserProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
  format: Format;
  categories: string[];
  cards: DeckCard[];
  dispatch: (action: ZoneAction) => void;
  commanderIdentity: string[];
}

/**
 * Card browser parent. Owns the shared search state (`raw` query is the single
 * source of truth; the Filters and Syntax tabs both read/write it) and picks
 * the surface by viewport: a docked side panel ≥lg, a bottom Scry Tray below.
 * Both share one provider mount so deck state and selection persist across a
 * breakpoint change.
 */
export function CardBrowser({
  open,
  onClose,
  deckId,
  format,
  categories,
  cards,
  dispatch,
  commanderIdentity,
}: CardBrowserProps) {
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<BrowserMode>("filters");
  const [density, setDensity] = useState<Density>("grid");
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const parsed = useMemo(() => parseSyntax(raw), [raw]);
  const activeCount = useMemo(() => activeFilterCount(parsed), [parsed]);
  const { results, loading, loadingMore, hasMore, count, error, showMore } =
    useCardBrowser(open ? raw : "");

  const browser: BrowserState = {
    raw,
    setRaw,
    mode,
    setMode,
    density,
    setDensity,
    parsed,
    activeCount,
    results,
    loading,
    loadingMore,
    hasMore,
    count,
    error,
    showMore,
  };

  if (!open) return null;

  return (
    <DeckBrowserProvider
      deckId={deckId}
      cards={cards}
      dispatch={dispatch}
      categories={categories}
      format={format}
      commanderIdentity={commanderIdentity}
    >
      {isDesktop ? (
        <SidePanel browser={browser} onClose={onClose} />
      ) : (
        <ScryTray browser={browser} onClose={onClose} />
      )}
    </DeckBrowserProvider>
  );
}
