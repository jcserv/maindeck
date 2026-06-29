// "Universes Beyond" detection.
//
// Universes Beyond (UB) is Wizards' branding for Magic cards built around
// non-Magic IP (Lord of the Rings, Warhammer 40K, Fallout, …). Scryfall does
// not expose a single boolean for it, and `Printing` intentionally does not
// store `set_type` / `promo_types`, so we identify UB by its dedicated set
// codes. The list is a heuristic — it's the set of standalone UB products,
// kept deliberately conservative.
//
// Notably EXCLUDED: `sld` (Secret Lair Drop). Secret Lair is a mixed bag of
// in-universe and UB drops, so flagging the whole set as UB would produce
// false positives. Extend this set as new UB products release.
const UNIVERSES_BEYOND_SET_CODES: ReadonlySet<string> = new Set([
  "ltr", // The Lord of the Rings: Tales of Middle-earth
  "ltc", // …Commander
  "40k", // Warhammer 40,000 Commander
  "who", // Doctor Who
  "pip", // Fallout
  "rex", // Jurassic World Collection
  "acr", // Assassin's Creed
  "fin", // Final Fantasy
  "fic", // Final Fantasy Commander
  "bot", // Transformers
  "spm", // Marvel's Spider-Man
]);

/** True if a printing's set code belongs to a Universes Beyond product. */
export function isUniversesBeyondSet(setCode: string): boolean {
  return UNIVERSES_BEYOND_SET_CODES.has(setCode.toLowerCase());
}
