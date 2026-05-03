-- NOTE ON PRODUCTION ROLLOUT:
-- Prisma Migrate wraps every migration in a transaction, so CONCURRENTLY
-- cannot be used inline here (Postgres rejects it inside a transaction block).
-- On Neon, the non-concurrent statements below would take ACCESS EXCLUSIVE
-- locks on the affected tables. For production, apply the CONCURRENTLY /
-- NOT VALID variants manually BEFORE running `prisma migrate deploy`, then
-- mark this migration as applied:
--
--   psql "$DATABASE_URL" <<'SQL'
--
--   -- P1-A: Verification.identifier — better-auth password-reset / OTP lookups.
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_identifier_idx"
--     ON "verification" ("identifier");
--
--   -- P1-B: Account composite — better-auth OAuth callback resolves by (providerId, accountId).
--   --       NOT UNIQUE intentionally; better-auth linked-account edge cases are undocumented.
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "account_provider_id_account_id_idx"
--     ON "account" ("provider_id", "account_id");
--
--   -- P3-A: DeckCard.quantity must be positive.
--   --       NOT VALID skips the full-table scan; VALIDATE runs a ShareLock instead of
--   --       ACCESS EXCLUSIVE, safe to run online even as the deck_card table grows.
--   ALTER TABLE "deck_card"
--     ADD CONSTRAINT "deck_card_quantity_positive"
--     CHECK (quantity > 0) NOT VALID;
--   ALTER TABLE "deck_card"
--     VALIDATE CONSTRAINT "deck_card_quantity_positive";
--
--   -- P3-B: Deck.manualBracket must be NULL or a valid Bracket tier (1–5).
--   --       Bracket is Commander-only per domain rules; the constraint prevents
--   --       nonsense values but does not gate on Format — that is application logic.
--   ALTER TABLE "deck"
--     ADD CONSTRAINT "deck_manual_bracket_range"
--     CHECK (manual_bracket IS NULL OR manual_bracket BETWEEN 1 AND 5) NOT VALID;
--   ALTER TABLE "deck"
--     VALIDATE CONSTRAINT "deck_manual_bracket_range";
--
--   SQL
--   pnpm prisma migrate resolve --applied 20260503000000_auth_indexes_and_check_constraints
--
-- The non-concurrent / immediately-validating statements below remain so
-- dev/shadow databases converge on the same schema without extra steps.

-- P1-A: Verification.identifier — covers better-auth email-verification / OTP / password-reset lookups.
CREATE INDEX IF NOT EXISTS "verification_identifier_idx"
  ON "verification" ("identifier");

-- P1-B: Account composite — covers better-auth OAuth callback lookup by (providerId, accountId).
--       Not unique: better-auth linked-account invariants are undocumented; avoid constraint violations.
CREATE INDEX IF NOT EXISTS "account_provider_id_account_id_idx"
  ON "account" ("provider_id", "account_id");

-- P3-A: DeckCard.quantity positive check.
ALTER TABLE "deck_card"
  ADD CONSTRAINT "deck_card_quantity_positive"
  CHECK (quantity > 0);

-- P3-B: Deck.manualBracket range check — Bracket is a 1–5 Commander power tier; NULL means unset.
ALTER TABLE "deck"
  ADD CONSTRAINT "deck_manual_bracket_range"
  CHECK (manual_bracket IS NULL OR manual_bracket BETWEEN 1 AND 5);
