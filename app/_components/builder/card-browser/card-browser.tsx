"use client";

import { useMemo, useState } from "react";
import { parseSyntax } from "@/lib/search/syntax-parser";
import { Format } from "@/lib/generated/prisma/enums";
import { edhrecCommanderSlug } from "@/lib/edhrec/slug";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";
import { DeckBrowserProvider } from "./deck-browser-context";
import { useCardBrowser } from "./use-card-browser";
import { useEdhrecCards } from "./use-edhrec-cards";
import { useMediaQuery } from "./use-media-query";
import { activeFilterCount } from "./filter-builder";
import type { BrowserState } from "./browser-state";
import type { BrowserMode } from "./mode-tabs";
import type { BrowserSource } from "./source-picker";
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
  /** Commander-zone card names, used to address the EDHREC suggestion page. */
  commanderNames: string[];
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
  commanderNames,
}: CardBrowserProps) {
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<BrowserMode>("filters");
  const [source, setSource] = useState<BrowserSource>("scryfall");
  const [density, setDensity] = useState<Density>("grid");
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const commanderSlug = useMemo(
    () => edhrecCommanderSlug(commanderNames),
    [commanderNames],
  );
  const edhrecEnabled = format === Format.COMMANDER && commanderSlug !== null;
  // An EDHREC selection only takes effect when it's actually available.
  const activeSource: BrowserSource =
    source === "edhrec" && edhrecEnabled ? "edhrec" : "scryfall";

  const parsed = useMemo(() => parseSyntax(raw), [raw]);
  const activeCount = useMemo(() => activeFilterCount(parsed), [parsed]);

  const scryfall = useCardBrowser(
    open && activeSource === "scryfall" ? raw : "",
  );
  const edhrec = useEdhrecCards(
    commanderSlug,
    open && activeSource === "edhrec",
  );
  const active = activeSource === "edhrec" ? edhrec : scryfall;

  const browser: BrowserState = {
    raw,
    setRaw,
    mode,
    setMode,
    source: activeSource,
    setSource,
    edhrecEnabled,
    density,
    setDensity,
    parsed,
    activeCount,
    results: active.results,
    loading: active.loading,
    loadingMore: active.loadingMore,
    hasMore: active.hasMore,
    count: active.count,
    error: active.error,
    showMore: active.showMore,
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
