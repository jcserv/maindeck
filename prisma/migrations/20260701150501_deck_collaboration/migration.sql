-- CreateEnum
CREATE TYPE "proposal_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "deck" ADD COLUMN     "collaboration_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "deck_proposal" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "proposer_id" TEXT NOT NULL,
    "status" "proposal_status" NOT NULL DEFAULT 'PENDING',
    "changes" JSONB NOT NULL,
    "message" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deck_proposal_deck_id_status_idx" ON "deck_proposal"("deck_id", "status");

-- AddForeignKey
ALTER TABLE "deck_proposal" ADD CONSTRAINT "deck_proposal_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_proposal" ADD CONSTRAINT "deck_proposal_proposer_id_fkey" FOREIGN KEY ("proposer_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_proposal" ADD CONSTRAINT "deck_proposal_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
