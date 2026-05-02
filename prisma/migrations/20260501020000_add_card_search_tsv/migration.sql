-- Add a stored generated tsvector column combining name, oracle_text, and type_line.
-- This powers `@@ websearch_to_tsquery(...)` queries in the card search path,
-- replacing the seq-scan-bound ILIKE '%frag%' clauses on oracle_text and type_line.
-- pg_trgm is already enabled (see 20260421010000_perf_indices).
-- The name trgm GIN index (card_name_trgm_idx) already exists and is unchanged.

-- NOTE ON PRODUCTION ROLLOUT:
-- ALTER TABLE … ADD COLUMN with a GENERATED ALWAYS AS expression acquires an
-- ACCESS EXCLUSIVE lock while it backfills the column for every existing row.
-- For zero-downtime prod apply, run these manually BEFORE `prisma migrate deploy`,
-- then mark the migration as already applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--   ALTER TABLE "card"
--     ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
--       GENERATED ALWAYS AS (
--         to_tsvector('english',
--           coalesce(name, '') || ' ' ||
--           coalesce(oracle_text, '') || ' ' ||
--           coalesce(type_line, '')
--         )
--       ) STORED;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "card_search_tsv_idx"
--     ON "card" USING GIN (search_tsv);
--   SQL
--   pnpm prisma migrate resolve --applied 20260501020000_add_card_search_tsv

ALTER TABLE "card"
  ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce(name, '') || ' ' ||
        coalesce(oracle_text, '') || ' ' ||
        coalesce(type_line, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS "card_search_tsv_idx"
  ON "card" USING GIN (search_tsv);
