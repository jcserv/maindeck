import type { Metadata } from "next";
import type { Visibility, Format } from "@/lib/generated/prisma/enums";

/**
 * Minimum deck shape needed to derive SEO metadata + JSON-LD.
 *
 * Intentionally narrower than `getDeckById`'s return so the helper is easy to
 * unit-test without constructing a full DeckCard graph.
 */
export interface DeckForMetadata {
  id: string;
  name: string;
  description: string | null;
  format: Format;
  visibility: Visibility;
  updatedAt: Date;
  user: {
    username: string | null;
  } | null;
}

/**
 * Resolve the canonical site origin used in absolute URLs (sitemap, JSON-LD,
 * canonical link). `NEXT_PUBLIC_SITE_URL` wins; otherwise we fall back to the
 * production hostname so prerendered output never bakes in `localhost`.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env["NEXT_PUBLIC_SITE_URL"];
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "https://maindeck.app";
}

/** Absolute URL for a deck detail page. */
export function deckUrl(deckId: string): string {
  return `${getSiteUrl()}/deck/${deckId}`;
}

const DESCRIPTION_MAX = 160;

function buildDescription(deck: DeckForMetadata): string {
  const author = deck.user?.username ? ` by ${deck.user.username}` : "";
  const fallback = `${formatLabel(deck.format)} deck${author} on maindeck.`;
  const raw = deck.description?.trim();
  if (!raw) return fallback;
  if (raw.length <= DESCRIPTION_MAX) return raw;
  return `${raw.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

function formatLabel(format: Format): string {
  // Title-case the enum (COMMANDER -> Commander).
  return format.charAt(0) + format.slice(1).toLowerCase();
}

/**
 * Metadata for a missing or access-denied deck. Exported as a constant so
 * page-level `generateMetadata` can swap to it without re-deriving the
 * shape. Intentionally generic so PRIVATE deck names never leak to a
 * visitor who can't see the deck.
 */
export const NOT_FOUND_METADATA: Metadata = {
  title: "Deck not found",
  robots: { index: false, follow: false },
};

/**
 * Build Next.js `Metadata` for a deck detail page. The shape:
 *
 * - PUBLIC: title + description + canonical, indexable.
 * - UNLISTED: same canonical, but `robots: { index: false, follow: false }`
 *   so search engines don't surface link-shared decks.
 * - PRIVATE: title + canonical for the owner, but `noindex,nofollow` so
 *   crawlers never index it. Page-level `generateMetadata` is responsible
 *   for swapping to {@link NOT_FOUND_METADATA} when the visitor isn't the
 *   owner — the helper itself can't tell who's viewing.
 * - `null` deck: same as not-found.
 */
export function buildDeckMetadata(
  deck: DeckForMetadata | null,
): Metadata {
  if (!deck) return NOT_FOUND_METADATA;

  const canonical = deckUrl(deck.id);
  const description = buildDescription(deck);
  const title = `${deck.name} — ${formatLabel(deck.format)} deck`;

  const metadata: Metadata = {
    title,
    description,
    alternates: { canonical },
  };

  if (deck.visibility !== "PUBLIC") {
    metadata.robots = { index: false, follow: false };
  }

  return metadata;
}

/**
 * JSON-LD `CreativeWork` payload for a PUBLIC deck. Returns `null` for any
 * deck that shouldn't be advertised to search engines (UNLISTED, PRIVATE,
 * missing). Callers serialize via `JSON.stringify` into a `<script>` tag.
 */
export function buildDeckJsonLd(
  deck: DeckForMetadata | null,
): Record<string, unknown> | null {
  if (!deck || deck.visibility !== "PUBLIC") return null;

  const author = deck.user?.username
    ? { "@type": "Person", name: deck.user.username }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: deck.name,
    url: deckUrl(deck.id),
    description: buildDescription(deck),
    dateModified: deck.updatedAt.toISOString(),
    genre: `Magic: The Gathering ${formatLabel(deck.format)} deck`,
    ...(author ? { author } : {}),
  };
}
