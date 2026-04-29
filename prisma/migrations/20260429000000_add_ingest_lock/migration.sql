-- CreateTable
CREATE TABLE "ingest_lock" (
    "source" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_lock_pkey" PRIMARY KEY ("source")
);
