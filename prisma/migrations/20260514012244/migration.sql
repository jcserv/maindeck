-- CreateEnum
CREATE TYPE "holding_state" AS ENUM ('OWNED', 'WISHLIST');

-- CreateTable
CREATE TABLE "holding" (
    "user_id" TEXT NOT NULL,
    "printing_id" INTEGER NOT NULL,
    "is_foil" BOOLEAN NOT NULL DEFAULT false,
    "state" "holding_state" NOT NULL DEFAULT 'OWNED',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_pkey" PRIMARY KEY ("user_id","printing_id","is_foil")
);

-- CreateIndex
CREATE INDEX "holding_user_id_state_idx" ON "holding"("user_id", "state");

-- CreateIndex
CREATE INDEX "holding_user_id_printing_id_idx" ON "holding"("user_id", "printing_id");

-- CreateIndex
CREATE INDEX "holding_printing_id_idx" ON "holding"("printing_id");

-- AddForeignKey
ALTER TABLE "holding" ADD CONSTRAINT "holding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding" ADD CONSTRAINT "holding_printing_id_fkey" FOREIGN KEY ("printing_id") REFERENCES "printing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
