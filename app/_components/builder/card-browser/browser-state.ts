import type { ParsedWhere } from "@/lib/search/syntax-parser";
import type { CardSearchResult } from "@/lib/search/card-search";
import type { BrowserMode } from "./mode-tabs";
import type { BrowserSource } from "./source-picker";
import type { Density } from "./density-toggle";

/** Shared search state threaded from the parent into whichever surface renders. */
export interface BrowserState {
  raw: string;
  setRaw: (raw: string) => void;
  mode: BrowserMode;
  setMode: (mode: BrowserMode) => void;
  /** Active data source: local Scryfall DB or EDHREC suggestions. */
  source: BrowserSource;
  setSource: (source: BrowserSource) => void;
  /** Whether EDHREC is selectable (Commander deck with a commander set). */
  edhrecEnabled: boolean;
  density: Density;
  setDensity: (density: Density) => void;
  parsed: ParsedWhere;
  activeCount: number;
  results: CardSearchResult[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  count: number;
  error: string | null;
  showMore: () => void;
}
