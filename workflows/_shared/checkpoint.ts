import { prisma } from "@/lib/db";

// Generic ingest-pipeline primitives parameterized by `source`. Callers
// supply their own `source` constant (e.g. `SCRYFALL_SOURCE`,
// `PRECON_SOURCE`) — those identity strings stay in the workflow modules.
//
// `IngestCheckpoint` rows are upserted by `source`; `getLastCheckpoint`
// returns the last `updatedAt` (or `null` if no row). Source-specific
// post-write actions (cache invalidation) belong in a wrapper step inside
// each workflow's own `steps.ts` (see `commitScryfallCheckpoint` /
// `commitPreconCheckpoint`).
export async function getLastCheckpoint(
  source: string,
): Promise<string | null> {
  "use step";
  const row = await prisma.ingestCheckpoint.findUnique({
    where: { source },
    select: { updatedAt: true },
  });
  return row?.updatedAt ?? null;
}

export async function writeCheckpoint(
  source: string,
  updatedAt: string,
): Promise<void> {
  "use step";
  await prisma.ingestCheckpoint.upsert({
    where: { source },
    create: { source, updatedAt },
    update: { updatedAt },
  });
}
