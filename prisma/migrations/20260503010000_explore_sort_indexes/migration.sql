-- NOTE ON PRODUCTION ROLLOUT:
-- Prisma Migrate wraps every migration in a transaction, so CONCURRENTLY
-- cannot be used inline here (Postgres rejects it inside a transaction block).
-- For production, apply the CONCURRENTLY variants manually BEFORE running
-- `prisma migrate deploy`, then mark this migration as applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_visibility_created_at_idx"
--     ON "deck" ("visibility", "created_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_visibility_released_at_idx"
--     ON "deck" ("visibility", "released_at" DESC);
--   SQL
--   pnpm prisma migrate resolve --applied 20260503010000_explore_sort_indexes
--
-- The non-concurrent statements below apply in dev/shadow databases without issue.

-- T5: index supporting sort=created (Newly created)
CREATE INDEX IF NOT EXISTS "deck_visibility_created_at_idx"
  ON "deck" ("visibility", "created_at" DESC);

-- T5: index supporting sort=released (Recently released)
-- released_at is nullable; NULLs sort last in DESC order by default in Postgres.
CREATE INDEX IF NOT EXISTS "deck_visibility_released_at_idx"
  ON "deck" ("visibility", "released_at" DESC);
