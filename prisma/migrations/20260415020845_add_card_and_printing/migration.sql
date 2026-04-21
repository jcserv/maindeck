-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment', 'Instant', 'Kindred', 'Land', 'Phenomenon', 'Plane', 'Planeswalker', 'Scheme', 'Sorcery', 'Vanguard', 'Unknown');

-- CreateTable
CREATE TABLE "card" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "main_type" "CardType" NOT NULL,
    "type_line" TEXT,
    "oracle_text" TEXT,
    "mana_cost" TEXT,
    "cmc" DOUBLE PRECISION,
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color_identity" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "power" TEXT,
    "toughness" TEXT,
    "games" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "legalities" JSONB NOT NULL DEFAULT '{}',
    "reserved" BOOLEAN NOT NULL DEFAULT false,
    "game_changer" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printing" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "scryfall_id" TEXT NOT NULL,
    "set_code" TEXT NOT NULL,
    "set_name" TEXT NOT NULL,
    "collector_number" TEXT NOT NULL,
    "is_serialized" BOOLEAN NOT NULL DEFAULT false,
    "finishes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "image_uri" TEXT NOT NULL,
    "back_image_uri" TEXT,
    "price_usd" DECIMAL(10,2),
    "price_usd_foil" DECIMAL(10,2),
    "price_usd_etched" DECIMAL(10,2),
    "price_eur" DECIMAL(10,2),
    "price_eur_foil" DECIMAL(10,2),
    "price_eur_etched" DECIMAL(10,2),

    CONSTRAINT "printing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_name_key" ON "card"("name");

-- CreateIndex
CREATE UNIQUE INDEX "printing_scryfall_id_key" ON "printing"("scryfall_id");

-- CreateIndex
CREATE INDEX "printing_card_id_idx" ON "printing"("card_id");

-- CreateIndex
CREATE INDEX "printing_set_code_idx" ON "printing"("set_code");

-- AddForeignKey
ALTER TABLE "printing" ADD CONSTRAINT "printing_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
