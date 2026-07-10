-- CreateIndex
CREATE INDEX "deck_revision_user_id_updated_at_idx" ON "deck_revision"("user_id", "updated_at" DESC);
