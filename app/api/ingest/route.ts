import { start } from "workflow/api";
import { scryfallIngestWorkflow } from "@/workflows/scryfall/ingest";

export const runtime = "nodejs";

export async function POST() {
  const run = await start(scryfallIngestWorkflow);
  return Response.json({ runId: run.runId });
}
