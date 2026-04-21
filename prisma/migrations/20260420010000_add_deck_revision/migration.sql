-- CreateTable
CREATE TABLE IF NOT EXISTS "deck_revision" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deck_revision_deck_id_updated_at_idx" ON "deck_revision" ("deck_id", "updated_at" DESC);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'deck_revision_deck_id_fkey'
    ) THEN
        ALTER TABLE "deck_revision"
        ADD CONSTRAINT "deck_revision_deck_id_fkey"
        FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
