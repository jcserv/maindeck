import { start } from "workflow/api";
import { getEnv } from "@/lib/env";
import { bearerMatches } from "./_auth";

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
