-- Drop deprecated columns and add required dateOfBirth. Existing rows are
-- backfilled to the Unix epoch (1970-01-01) so NOT NULL can be enforced
-- without losing dev data; real users will set this at sign-up.

ALTER TABLE "user"
  DROP COLUMN IF EXISTS "name",
  DROP COLUMN IF EXISTS "display_username";

ALTER TABLE "user"
  ADD COLUMN "date_of_birth" TIMESTAMP(3);

UPDATE "user"
  SET "date_of_birth" = '1970-01-01 00:00:00'
  WHERE "date_of_birth" IS NULL;

ALTER TABLE "user"
  ALTER COLUMN "date_of_birth" SET NOT NULL;

ALTER TABLE "user"
  ALTER COLUMN "username" SET NOT NULL;
