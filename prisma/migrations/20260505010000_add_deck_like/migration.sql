-- CreateTable
CREATE TABLE IF NOT EXISTS "deck_like" (
    "user_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_like_pkey" PRIMARY KEY ("user_id", "deck_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deck_like_deck_id_idx" ON "deck_like" ("deck_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'deck_like_user_id_fkey'
    ) THEN
        ALTER TABLE "deck_like"
        ADD CONSTRAINT "deck_like_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'deck_like_deck_id_fkey'
    ) THEN
        ALTER TABLE "deck_like"
        ADD CONSTRAINT "deck_like_deck_id_fkey"
        FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
