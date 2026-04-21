-- CreateTable
CREATE TABLE "ingest_checkpoint" (
    "source" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "ran_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_checkpoint_pkey" PRIMARY KEY ("source")
);
