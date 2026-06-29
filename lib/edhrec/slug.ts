/**
 * EDHREC commander slug derivation.
 *
 * EDHREC keys its commander pages by a "sanitized" slug: the card name
 * lowercased, accents stripped, apostrophes/commas/periods dropped, and every
 * remaining run of non-alphanumerics collapsed to a single hyphen
 * (e.g. "Norin, the Wary" → "norin-the-wary"). Double-faced names use only the
 * front face. A partner/background pair is the two single slugs sorted and
 * joined with a hyphen, matching EDHREC's combined-commander URLs.
 */

/** Slugify a single commander name to its EDHREC `sanitized` form. */
export function edhrecCardSlug(name: string): string {
  // Front face only for DFCs / split cards.
  // split() always yields at least one element; the assertion is safe.
  const front = name.split("//")[0]!;
  return front
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/['’.,]/g, "") // drop apostrophes/commas/periods entirely
    .replace(/[^a-z0-9]+/g, "-") // collapse other runs to a hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * Build the EDHREC page slug for one or more commander names. A single name maps
 * to its card slug; a partner pair is the two slugs sorted alphabetically and
 * joined, which is how EDHREC addresses combined-commander pages. Returns `null`
 * when no usable name is supplied.
 */
export function edhrecCommanderSlug(names: string[]): string | null {
  const slugs = names
    .map(edhrecCardSlug)
    .filter((s) => s.length > 0)
    // Alphabetical ordering of the pair is an assumption about EDHREC's
    // combined-commander URL scheme, not a contract: verified to return HTTP
    // 200 for sampled partner pairs. If EDHREC ever changes the ordering, those
    // pages 404 -> 502 -> error state.
    .sort();
  if (slugs.length === 0) return null;
  return slugs.join("-");
}
