-- CreateEnum
CREATE TYPE "zone" AS ENUM ('MAINBOARD', 'SIDEBOARD', 'CONSIDERING', 'COMMANDER');

-- Add zone column with default MAINBOARD
ALTER TABLE "deck_card" ADD COLUMN "zone" "zone" NOT NULL DEFAULT 'MAINBOARD';

-- Backfill zone from legacy category string
UPDATE "deck_card" SET "zone" = 'SIDEBOARD'   WHERE "category" = 'Sideboard';
UPDATE "deck_card" SET "zone" = 'CONSIDERING' WHERE "category" = 'Considering';
UPDATE "deck_card" SET "zone" = 'COMMANDER'  WHERE "category" = 'Commander';
-- Any other value (including 'Mainboard') stays MAINBOARD by default.

-- Drop NOT NULL on category, then null-out rows whose category was a zone name.
ALTER TABLE "deck_card" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "deck_card" ALTER COLUMN "category" DROP DEFAULT;

UPDATE "deck_card"
   SET "category" = NULL
 WHERE "category" IN ('Mainboard', 'Sideboard', 'Considering', 'Commander');

-- Drop DeckCategory rows representing the four built-in zones (including Commander
-- for decks that had a legacy "Commander" user-category row).
DELETE FROM "deck_category" WHERE "name" IN ('Mainboard', 'Sideboard', 'Considering', 'Commander');

-- Drop is_built_in now that zones are not stored in deck_category.
ALTER TABLE "deck_category" DROP COLUMN "is_built_in";

-- Replace old unique constraint with zone+category composite, NULLS NOT DISTINCT
-- so (deckId, cardId, MAINBOARD, NULL) collapses into a single row.
DROP INDEX "deck_card_deck_id_card_id_category_key";
CREATE UNIQUE INDEX "deck_card_deck_id_card_id_zone_category_key"
  ON "deck_card" ("deck_id", "card_id", "zone", "category")
  NULLS NOT DISTINCT;
