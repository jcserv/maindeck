-- The original publish date of an ingested precon (from MTGJSON's
-- `releaseDate`). Nullable because user-built decks don't have one;
-- their UI falls back to `updated_at`.
ALTER TABLE "deck" ADD COLUMN "released_at" DATE;
