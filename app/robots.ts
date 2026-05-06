import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/deck/metadata";

/**
 * `robots.txt`. Allows crawlers into `/deck/*` and `/decks/*` (the public
 * deck routes) plus the rest of the marketing surface, and points at the
 * sitemap. We disallow Next.js internals and the API surface — neither is
 * useful indexable content.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/deck/", "/decks/"],
        disallow: ["/api/", "/_next/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
