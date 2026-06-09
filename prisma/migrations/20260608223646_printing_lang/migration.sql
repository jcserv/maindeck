-- AlterTable
ALTER TABLE "printing" ADD COLUMN     "lang" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "printed_name" TEXT;
