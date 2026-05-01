-- Allow multiple deck_card rows per (deck_id, card_id, zone, category) so users
-- can pin different printings/finishes of the same card (e.g. nine Swamps, each
-- a different printing). De-duplication of unpinned rows is enforced in app
-- code (lib/deck/mutation/apply.ts), not at the schema layer.

-- NOTE ON PRODUCTION ROLLOUT:
-- Prisma's @@unique was materialized as a bare UNIQUE INDEX, not a table
-- constraint, so DROP CONSTRAINT alone leaves it in place — DROP INDEX is
-- what actually removes enforcement. Both forms below are idempotent.
-- For zero-lock prod rollouts, apply these manually BEFORE
-- `prisma migrate deploy`, then mark applied:
--
--   psql "$DATABASE_URL" -c 'DROP INDEX IF EXISTS "deck_card_deck_id_card_id_zone_category_key";'
--   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_card_deck_id_card_id_zone_category_idx" ON "deck_card" ("deck_id", "card_id", "zone", "category");'
--   pnpm prisma migrate resolve --applied 20260501010000_deck_card_allow_multi_printing

ALTER TABLE "deck_card"
  DROP CONSTRAINT IF EXISTS "deck_card_deck_id_card_id_zone_category_key";

DROP INDEX IF EXISTS "deck_card_deck_id_card_id_zone_category_key";

CREATE INDEX IF NOT EXISTS "deck_card_deck_id_card_id_zone_category_idx"
  ON "deck_card" ("deck_id", "card_id", "zone", "category");
