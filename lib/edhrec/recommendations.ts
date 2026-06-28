import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { findCardsByNames, type CardSearchResult } from "@/lib/search/card-search";
import { logWarn } from "@/lib/telemetry";

const EDHREC_BASE = "https://json.edhrec.com/pages/commanders";

/** Abort the upstream fetch after this long so a slow EDHREC never stalls a request. */
const FETCH_TIMEOUT_MS = 4_000;

/** Cap how many suggestion names we forward to the DB lookup. */
const MAX_SUGGESTIONS = 400;

/** Distinguishes upstream/timeout failures from a genuinely empty result. */
export class EdhrecUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EdhrecUnavailableError";
  }
}

/** A single EDHREC suggestion mapped to a local **Card**, carrying its ranking. */
export interface EdhrecSuggestion extends CardSearchResult {
  /** EDHREC synergy score for this card under the commander (higher = more on-theme). */
  synergy: number;
  /** Number of decks EDHREC sampled that run the card. */
  inclusion: number;
}

interface RawCardview {
  name?: unknown;
  synergy?: unknown;
  inclusion?: unknown;
}

interface RawCardlist {
  cardviews?: unknown;
}

interface RawEdhrecPage {
  container?: { json_dict?: { cardlists?: unknown } };
}

interface RankedName {
  name: string;
  synergy: number;
  inclusion: number;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Flatten an EDHREC page's `cardlists` into a deduped, ranking-bearing name list.
 * The first occurrence of a name wins (EDHREC lists the most relevant buckets
 * first), so synergy/inclusion reflect the most prominent placement.
 */
function extractRankedNames(page: RawEdhrecPage): RankedName[] {
  const cardlists = page.container?.json_dict?.cardlists;
  if (!Array.isArray(cardlists)) return [];

  const seen = new Set<string>();
  const ranked: RankedName[] = [];
  for (const list of cardlists as RawCardlist[]) {
    const cardviews = list?.cardviews;
    if (!Array.isArray(cardviews)) continue;
    for (const cv of cardviews as RawCardview[]) {
      const name = typeof cv?.name === "string" ? cv.name.trim() : "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push({
        name,
        synergy: toNumber(cv.synergy),
        inclusion: toNumber(cv.inclusion),
      });
      if (ranked.length >= MAX_SUGGESTIONS) return ranked;
    }
  }
  return ranked;
}

/**
 * Fetch the raw EDHREC commander page JSON with a hard timeout. Throws
 * `EdhrecUnavailableError` on timeout, network failure, or non-2xx (including
 * 404 for an unknown commander) so callers can render an error state rather than
 * blocking. Network-only; the parsing/DB mapping lives in `getEdhrecSuggestions`.
 */
async function fetchEdhrecPage(slug: string): Promise<RawEdhrecPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${EDHREC_BASE}/${slug}.json`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new EdhrecUnavailableError(`EDHREC responded ${res.status} for ${slug}`);
    }
    return (await res.json()) as RawEdhrecPage;
  } catch (err) {
    if (err instanceof EdhrecUnavailableError) throw err;
    const reason = (err as Error)?.name === "AbortError" ? "timeout" : "fetch failed";
    throw new EdhrecUnavailableError(`EDHREC ${reason} for ${slug}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Suggested cards for a commander, mapped to local **Card** rows in EDHREC's
 * ranking order. Cached so a single upstream fetch serves many viewers and a
 * cooperating commander page never re-fetches within the cache window. Names
 * with no local row are dropped. Throws `EdhrecUnavailableError` on upstream
 * failure so the route can translate it to a 502 without caching the miss.
 */
export async function getEdhrecSuggestions(
  slug: string,
): Promise<EdhrecSuggestion[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("edhrec", `edhrec:${slug}`);

  let page: RawEdhrecPage;
  try {
    page = await fetchEdhrecPage(slug);
  } catch (err) {
    logWarn({ source: "edhrec", slug }, "EDHREC fetch failed", err);
    throw err;
  }

  const ranked = extractRankedNames(page);
  if (ranked.length === 0) return [];

  const cards = await findCardsByNames(ranked.map((r) => r.name));
  const meta = new Map(ranked.map((r) => [r.name.toLowerCase(), r]));

  return cards.map((card) => {
    const m = meta.get(card.name.toLowerCase());
    return { ...card, synergy: m?.synergy ?? 0, inclusion: m?.inclusion ?? 0 };
  });
}
