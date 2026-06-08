-- Add a GIN index on card.color_identity (text[]) to back the `@>` array
-- containment used by the `c:` color filter in card search (searchCardsBySyntax).
-- Without it, `color_identity @> ARRAY[...]::text[]` falls back to a seq scan.
-- The default GIN array_ops operator class supports @>, <@, &&, and =.

-- NOTE ON PRODUCTION ROLLOUT:
-- A plain CREATE INDEX takes an ACCESS EXCLUSIVE lock on "card" for the build.
-- For zero-downtime prod apply, run the CONCURRENTLY form manually BEFORE
-- `prisma migrate deploy`, then mark this migration already applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "card_color_identity_idx"
--     ON "card" USING GIN (color_identity);
--   SQL
--   pnpm prisma migrate resolve --applied 20260608000000_card_color_identity_gin

CREATE INDEX IF NOT EXISTS "card_color_identity_idx"
  ON "card" USING GIN (color_identity);
