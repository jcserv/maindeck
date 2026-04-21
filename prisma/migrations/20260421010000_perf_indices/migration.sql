-- Enable pg_trgm extension for trigram-based substring search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- NOTE ON PRODUCTION ROLLOUT:
-- Prisma Migrate wraps every migration in a transaction, so CONCURRENTLY
-- cannot be used inline here (Postgres rejects it). On Neon/Railway, the
-- non-concurrent statements below would take ACCESS EXCLUSIVE locks on the
-- affected tables. For production, apply the CONCURRENTLY variants manually
-- BEFORE running `prisma migrate deploy`, then mark this migration as applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   DROP INDEX CONCURRENTLY IF EXISTS "deck_user_id_idx";
--   DROP INDEX CONCURRENTLY IF EXISTS "deck_card_deck_id_idx";
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_user_id_updated_at_idx"
--     ON "deck" ("user_id", "updated_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_visibility_updated_at_idx"
--     ON "deck" ("visibility", "updated_at" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "deck_card_deck_id_zone_idx"
--     ON "deck_card" ("deck_id", "zone");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "card_name_trgm_idx"
--     ON "card" USING gin ("name" gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "session_user_id_idx"
--     ON "session" ("user_id");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "account_user_id_idx"
--     ON "account" ("user_id");
--   SQL
--   pnpm prisma migrate resolve --applied 20260421010000_perf_indices
--
-- The non-concurrent statements below remain so dev/shadow databases converge
-- on the same schema.

-- Drop single-column indices being superseded by composites.
DROP INDEX IF EXISTS "deck_user_id_idx";
DROP INDEX IF EXISTS "deck_card_deck_id_idx";

-- Deck: covers dashboard queries filtering by user_id ordered by updated_at DESC.
CREATE INDEX IF NOT EXISTS "deck_user_id_updated_at_idx"
  ON "deck" ("user_id", "updated_at" DESC);

-- Deck: covers public homepage strip and /decks browse — visibility + updated_at DESC.
CREATE INDEX IF NOT EXISTS "deck_visibility_updated_at_idx"
  ON "deck" ("visibility", "updated_at" DESC);

-- DeckCard: covers getDeckCardCounts and getTokensForDeck filtering deck_id + zone.
CREATE INDEX IF NOT EXISTS "deck_card_deck_id_zone_idx"
  ON "deck_card" ("deck_id", "zone");

-- Card: trigram GIN index so ILIKE '%q%' autocomplete hits an index instead of seq scan.
CREATE INDEX IF NOT EXISTS "card_name_trgm_idx"
  ON "card" USING gin ("name" gin_trgm_ops);

-- Session / Account: FK-style index for better-auth userId lookups.
CREATE INDEX IF NOT EXISTS "session_user_id_idx"
  ON "session" ("user_id");

CREATE INDEX IF NOT EXISTS "account_user_id_idx"
  ON "account" ("user_id");
