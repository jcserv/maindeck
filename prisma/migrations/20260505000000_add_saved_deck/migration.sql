-- CreateTable
CREATE TABLE "saved_deck" (
    "user_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_deck_pkey" PRIMARY KEY ("user_id","deck_id")
);

-- CreateIndex
CREATE INDEX "saved_deck_user_id_created_at_idx" ON "saved_deck"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "saved_deck_deck_id_idx" ON "saved_deck"("deck_id");

-- AddForeignKey
ALTER TABLE "saved_deck" ADD CONSTRAINT "saved_deck_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_deck" ADD CONSTRAINT "saved_deck_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
