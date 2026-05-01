-- Allow multiple deck_card rows per (deck_id, card_id, zone, category) so users
-- can pin different printings/finishes of the same card (e.g. nine Swamps, each
-- a different printing). De-duplication of unpinned rows is enforced in app
-- code (lib/deck/mutation/apply.ts), not at the schema layer.

-- NOTE ON PRODUCTION ROLLOUT:
-- Prisma Migrate wraps every migration in a transaction, so CONCURRENTLY
-- cannot be used inline. On Neon/Railway, prefer applying these manually
-- BEFORE `prisma migrate deploy`, then mark applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--   ALTER TABLE "deck_card"
--     DROP CONSTRAINT IF EXISTS "deck_card_deck_id_card_id_zone_category_key";
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS
--     "deck_card_deck_id_card_id_zone_category_idx"
--     ON "deck_card" ("deck_id", "card_id", "zone", "category");
--   SQL
--   pnpm prisma migrate resolve --applied 20260501010000_deck_card_allow_multi_printing

ALTER TABLE "deck_card"
  DROP CONSTRAINT IF EXISTS "deck_card_deck_id_card_id_zone_category_key";

CREATE INDEX IF NOT EXISTS "deck_card_deck_id_card_id_zone_category_idx"
  ON "deck_card" ("deck_id", "card_id", "zone", "category");
