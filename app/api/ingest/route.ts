import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { getEnv } from "@/lib/env";
import { scryfallIngestWorkflow } from "@/workflows/scryfall/ingest";

export const runtime = "nodejs";

const TOKEN_HEADER = "x-maindeck-ingest-token";

function tokenMatches(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const env = getEnv();
  if (!tokenMatches(req.headers.get(TOKEN_HEADER), env.INGEST_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const run = await start(scryfallIngestWorkflow);
  return Response.json({ runId: run.runId });
}
