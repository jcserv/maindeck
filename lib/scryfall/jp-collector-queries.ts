// Source of truth for which Japanese collector printings the ingest enriches
// after the English bulk upsert. Each entry is a Scryfall search query run with
// `unique=prints`; results across queries are deduped by `scryfallId` before
// upsert. Spot-check a query's result count before adding it.
//
// The art tag does the heavy lifting — `art:japanese-exclusive-art` already
// isolates Japanese-exclusive-art printings across every set (sta, soa, war,
// iko, sld, snc, ...), so new exclusive-art sets are picked up with no
// per-set maintenance. NEO is a named supplement because its soft-glow /
// ukiyo-e treatments reuse the English art (a finish/frame, not exclusive art)
// and so fall outside the art tag.
export const JP_COLLECTOR_QUERIES = [
  // Cross-set Japanese-exclusive-art collector printings. `-is:promo` drops the
  // scattered promo sets (Player Rewards, Worlds, premium-foil).
  "art:japanese-exclusive-art lang:ja -is:promo",
  // Kamigawa soft-glow / ukiyo-e reuse English art, so the art tag misses them.
  "set:neo lang:ja is:fullart",
] as const;
