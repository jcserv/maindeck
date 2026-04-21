-- Restore columns required by better-auth core (name) and the username plugin
-- (displayUsername). The earlier drop migration assumed these were redundant
-- with username, but better-auth's createUser hard-requires `name` and the
-- username plugin writes `displayUsername` on signup. Backfill both from
-- username so NOT NULL can be enforced on name without losing dev data.

ALTER TABLE "user"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "display_username" TEXT;

UPDATE "user" SET "name" = "username" WHERE "name" IS NULL;
UPDATE "user" SET "display_username" = "username" WHERE "display_username" IS NULL;

ALTER TABLE "user" ALTER COLUMN "name" SET NOT NULL;
