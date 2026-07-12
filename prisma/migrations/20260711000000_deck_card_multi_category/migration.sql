-- Multi-category cards (issue #30).
--
-- Replaces the single `deck_card.category` string with an ordered join table
-- `deck_card_category` (lowest position = primary). Because category is no
-- longer part of a DeckCard's identity, rows that only differed by category
-- are merged into one row per (deck_id, card_id, zone, printing_id, is_foil),
-- with total quantity preserved exactly and each old category becoming a
-- membership ordered by how many copies it held.

-- 1. Join table.
CREATE TABLE "deck_card_category" (
    "deck_card_id" TEXT NOT NULL,
    "deck_category_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deck_card_category_pkey" PRIMARY KEY ("deck_card_id","deck_category_id")
);

CREATE INDEX "deck_card_category_deck_category_id_idx" ON "deck_card_category"("deck_category_id");

ALTER TABLE "deck_card_category" ADD CONSTRAINT "deck_card_category_deck_card_id_fkey" FOREIGN KEY ("deck_card_id") REFERENCES "deck_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deck_card_category" ADD CONSTRAINT "deck_card_category_deck_category_id_fkey" FOREIGN KEY ("deck_category_id") REFERENCES "deck_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill deck_category rows for orphan MAINBOARD category strings
--    (the wishlist flow wrote strings without registry rows).
INSERT INTO "deck_category" ("id", "deck_id", "name", "sort_order")
SELECT
    gen_random_uuid()::text,
    o."deck_id",
    o."name",
    COALESCE(m."max_order", -1)
        + ROW_NUMBER() OVER (PARTITION BY o."deck_id" ORDER BY o."name")
FROM (
    SELECT DISTINCT dc."deck_id", dc."category" AS "name"
    FROM "deck_card" dc
    WHERE dc."zone" = 'MAINBOARD' AND dc."category" IS NOT NULL
) o
LEFT JOIN (
    SELECT "deck_id", MAX("sort_order") AS "max_order"
    FROM "deck_category"
    GROUP BY "deck_id"
) m ON m."deck_id" = o."deck_id"
WHERE NOT EXISTS (
    SELECT 1 FROM "deck_category" c
    WHERE c."deck_id" = o."deck_id" AND c."name" = o."name"
);

-- 3. Merge rows that only differ by category. NULL printing_id groups as one
--    bucket (window PARTITION BY treats NULLs as equal). Keeper = highest
--    quantity, then oldest, then id for determinism.
CREATE TEMPORARY TABLE "_dc_merge" AS
SELECT
    "id",
    "deck_id",
    "zone",
    "category",
    "quantity",
    ROW_NUMBER() OVER (
        PARTITION BY "deck_id", "card_id", "zone", "printing_id", "is_foil"
        ORDER BY "quantity" DESC, "created_at" ASC, "id" ASC
    ) AS "rn",
    FIRST_VALUE("id") OVER (
        PARTITION BY "deck_id", "card_id", "zone", "printing_id", "is_foil"
        ORDER BY "quantity" DESC, "created_at" ASC, "id" ASC
    ) AS "keeper_id",
    SUM("quantity") OVER (
        PARTITION BY "deck_id", "card_id", "zone", "printing_id", "is_foil"
    ) AS "total_quantity"
FROM "deck_card";

-- 3a. Memberships: every category held by any row in the bucket, positions
--     ordered by copies held (desc) so the primary is the category that held
--     the most copies. Non-MAINBOARD category strings are dropped (they are
--     already invisible in the app). Positions are 0-based.
INSERT INTO "deck_card_category" ("deck_card_id", "deck_category_id", "position")
SELECT
    k."keeper_id",
    cat."id",
    ROW_NUMBER() OVER (
        PARTITION BY k."keeper_id"
        ORDER BY k."qty" DESC, cat."name" ASC
    ) - 1
FROM (
    SELECT r."keeper_id", r."deck_id", r."category", SUM(r."quantity") AS "qty"
    FROM "_dc_merge" r
    WHERE r."zone" = 'MAINBOARD' AND r."category" IS NOT NULL
    GROUP BY r."keeper_id", r."deck_id", r."category"
) k
JOIN "deck_category" cat
    ON cat."deck_id" = k."deck_id" AND cat."name" = k."category";

-- 3b. Sum merged quantities onto the keeper (totals exactly preserved).
UPDATE "deck_card" dc
SET "quantity" = r."total_quantity"
FROM "_dc_merge" r
WHERE dc."id" = r."keeper_id"
  AND r."rn" = 1
  AND dc."quantity" <> r."total_quantity";

-- 3c. Delete the merged non-keeper rows.
DELETE FROM "deck_card"
WHERE "id" IN (SELECT "id" FROM "_dc_merge" WHERE "rn" <> 1);

DROP TABLE "_dc_merge";

-- 4. Drop the old column and its index; replace with a category-free index.
DROP INDEX IF EXISTS "deck_card_deck_id_card_id_zone_category_idx";
ALTER TABLE "deck_card" DROP COLUMN "category";
CREATE INDEX "deck_card_deck_id_card_id_zone_idx" ON "deck_card"("deck_id", "card_id", "zone");
