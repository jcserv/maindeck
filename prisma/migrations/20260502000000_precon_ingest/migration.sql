-- External-key columns on Deck for the precon ingest workflow (and future
-- ingest sources). Both id columns are nullable; partial-index behavior in
-- Postgres makes the unique constraint a no-op for user-built decks (NULLs
-- don't collide).
ALTER TABLE "deck"
  ADD COLUMN "external_source"  TEXT,
  ADD COLUMN "external_id"      TEXT,
  ADD COLUMN "external_version" TEXT;

CREATE UNIQUE INDEX "deck_external_key"
  ON "deck" ("external_source", "external_id");

-- Tracks per-deck ingest failures (e.g. unmatched card names when Scryfall
-- lags behind a new precon release). Upsert-keyed on (source, externalId);
-- `resolved` flips to true once a subsequent run succeeds.
CREATE TABLE "ingest_deck_failure" (
  "id"            SERIAL PRIMARY KEY,
  "source"        TEXT      NOT NULL,
  "external_id"   TEXT      NOT NULL,
  "reason"        TEXT      NOT NULL,
  "details"       JSONB     NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "last_seen_at"  TIMESTAMP(3) NOT NULL,
  "resolved"      BOOLEAN   NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX "ingest_deck_failure_source_external_id_key"
  ON "ingest_deck_failure" ("source", "external_id");

CREATE INDEX "ingest_deck_failure_source_resolved_idx"
  ON "ingest_deck_failure" ("source", "resolved");

-- Seed the wotc system user. ID is hardcoded so workflow code can resolve
-- it without a lookup. better-auth doesn't manage this row (no Account row,
-- can never log in). The dateOfBirth is arbitrary but stable (Magic's release).
INSERT INTO "user" (
  id, email, email_verified, name, username, display_username,
  date_of_birth, created_at, updated_at
)
VALUES (
  'wotc',
  'wotc-system@maindeck.internal',
  false,
  'Wizards of the Coast',
  'wotc',
  'Wizards of the Coast',
  '1993-08-05',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
