import type { MetadataRoute } from "next";
import { getPublicDecksForSitemap } from "@/lib/deck/queries";
import { getSiteUrl } from "@/lib/deck/metadata";

/**
 * Sitemap of every PUBLIC deck.
 *
 * - User decks (externalSource IS NULL) get priority 0.8.
 * - Precons (externalSource = "mtgjson") get priority 0.5 — they're useful
 *   reference but lower-value indexable content than community decks.
 *
 * Caching is delegated to `getPublicDecksForSitemap` ('use cache' +
 * `decks:public` tag + `hours` lifetime), so this file stays a pure mapper.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteUrl();
  const decks = await getPublicDecksForSitemap();

  const root: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${origin}/decks`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];

  const entries: MetadataRoute.Sitemap = decks.map((d) => ({
    url: `${origin}/deck/${d.id}`,
    lastModified: d.updatedAt,
    changeFrequency: "weekly",
    priority: d.externalSource === null ? 0.8 : 0.5,
  }));

  return [...root, ...entries];
}
