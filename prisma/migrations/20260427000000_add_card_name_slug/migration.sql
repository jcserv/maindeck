-- Add nullable name_slug column on card. Populated by the daily Scryfall
-- ingest (toCardCreate) — no backfill needed. Lookups in getCardBySlug
-- match against this column instead of the lossy deslug(name) approach.
ALTER TABLE "card" ADD COLUMN "name_slug" TEXT;

-- NOTE ON PRODUCTION ROLLOUT:
-- Prisma Migrate wraps every migration in a transaction, so CONCURRENTLY
-- cannot be used inline. On production, apply the CONCURRENTLY variant
-- manually BEFORE running `prisma migrate deploy`, then mark this migration
-- as applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--   ALTER TABLE "card" ADD COLUMN IF NOT EXISTS "name_slug" TEXT;
--   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "card_name_slug_key"
--     ON "card" ("name_slug");
--   SQL
--   pnpm prisma migrate resolve --applied 20260427000000_add_card_name_slug
CREATE UNIQUE INDEX "card_name_slug_key" ON "card"("name_slug");
