-- AlterTable
ALTER TABLE "user"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "display_username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");
