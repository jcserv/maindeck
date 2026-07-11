-- NOTE ON PRODUCTION ROLLOUT:
-- Prisma Migrate wraps every migration in a transaction, so CONCURRENTLY
-- cannot be used inline here (Postgres rejects it inside a transaction block).
-- For production, apply the CONCURRENTLY variant manually BEFORE running
-- `prisma migrate deploy`, then mark this migration as applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_revision_user_id_updated_at_idx"
--     ON "deck_revision" ("user_id", "updated_at" DESC);
--   SQL
--   pnpm prisma migrate resolve --applied 20260710212937_deck_revision_user_updated_at_idx
--
-- The non-concurrent statement below applies in dev/shadow databases without issue.

-- Supports the updates feed: recent revisions by followed editors, newest first.
CREATE INDEX IF NOT EXISTS "deck_revision_user_id_updated_at_idx"
  ON "deck_revision" ("user_id", "updated_at" DESC);
