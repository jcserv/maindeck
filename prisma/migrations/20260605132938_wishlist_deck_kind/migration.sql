-- CreateEnum
CREATE TYPE "deck_kind" AS ENUM ('DECK', 'WISHLIST');

-- AlterTable
ALTER TABLE "deck" ADD COLUMN     "kind" "deck_kind" NOT NULL DEFAULT 'DECK';

-- CreateIndex
CREATE INDEX "deck_user_id_kind_idx" ON "deck"("user_id", "kind");

-- Data migration: back existing WISHLIST holdings with a per-user wishlist deck.
-- 1. One kind=WISHLIST deck per user holding WISHLIST rows.
-- 2. A pinned DeckCard (printing + foil) per WISHLIST holding.
-- 3. Delete the migrated WISHLIST holdings (the WISHLIST enum value stays).
WITH wishlist_users AS (
    SELECT DISTINCT "user_id" FROM "holding" WHERE "state" = 'WISHLIST'
), new_decks AS (
    INSERT INTO "deck" ("id", "user_id", "name", "format", "visibility", "kind", "created_at", "updated_at")
    SELECT gen_random_uuid()::text, "user_id", 'Wishlist', 'CASUAL', 'PRIVATE', 'WISHLIST', now(), now()
    FROM wishlist_users
    RETURNING "id", "user_id"
)
INSERT INTO "deck_card" ("id", "deck_id", "card_id", "quantity", "zone", "printing_id", "is_foil", "created_at", "updated_at")
SELECT gen_random_uuid()::text, nd."id", p."card_id", h."quantity", 'MAINBOARD', h."printing_id", h."is_foil", now(), now()
FROM "holding" h
JOIN new_decks nd ON nd."user_id" = h."user_id"
JOIN "printing" p ON p."id" = h."printing_id"
WHERE h."state" = 'WISHLIST';

DELETE FROM "holding" WHERE "state" = 'WISHLIST';
