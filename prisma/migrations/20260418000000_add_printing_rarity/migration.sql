-- CreateEnum
CREATE TYPE "rarity" AS ENUM ('Common', 'Uncommon', 'Rare', 'Mythic', 'Special', 'Bonus');

-- AlterTable
ALTER TABLE "printing" ADD COLUMN "rarity" "rarity";

-- CreateIndex
CREATE INDEX "printing_rarity_idx" ON "printing"("rarity");
