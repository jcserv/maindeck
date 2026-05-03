import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { getEnv } from "@/lib/env";

const BEARER_PREFIX = "Bearer ";

function bearerMatches(header: string | null, expected: string): boolean {
  if (header === null || !header.startsWith(BEARER_PREFIX)) return false;
  const a = Buffer.from(header.slice(BEARER_PREFIX.length));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createCronWorkflowHandler(
  workflow: Parameters<typeof start>[0],
) {
  return async (req: Request) => {
    const env = getEnv();
    if (!bearerMatches(req.headers.get("authorization"), env.CRON_SECRET)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const run = await start(workflow);
    return Response.json({ runId: run.runId });
  };
}
