import { getWorld } from "workflow/runtime";
import { parseWorkflowName } from "workflow/observability";
import { getEnv } from "@/lib/env";
import { bearerMatches } from "../_auth";

// External monitors (and operators) need to alert on ingest failures separately
// from the cron handoff. Cron success only means `start()` enqueued a run; the
// run itself can still fail without surfacing in the Vercel cron dashboard.
//
// This route surfaces the latest few runs of the two ingest workflows so a
// monitor can poll for `status === "failed"` (or `"running"` past the expected
// duration) and page accordingly.
//
// Refs:
// - node_modules/workflow/docs/api-reference/workflow-api/world/storage.mdx
// - node_modules/workflow/docs/api-reference/workflow-api/world/observability.mdx

const WORKFLOWS = ["scryfallIngestWorkflow", "preconIngestWorkflow"] as const;
const PER_WORKFLOW_LIMIT = 5;
// Cap how many runs we scan from storage. Recent runs come first under
// `sortOrder: 'desc'`, so this is a hard ceiling on work, not a correctness
// constraint. Well above PER_WORKFLOW_LIMIT * WORKFLOWS.length so a noisy
// neighbour workflow can't starve us.
const SCAN_LIMIT = 50;

type RunSummary = {
  runId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
};

export async function GET(req: Request) {
  if (!bearerMatches(req.headers.get("authorization"), getEnv().CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const world = getWorld();
  const result = await world.runs.list({
    pagination: { limit: SCAN_LIMIT, sortOrder: "desc" },
    resolveData: "none",
  });

  const grouped: Record<string, RunSummary[]> = Object.fromEntries(
    WORKFLOWS.map((name) => [name, []]),
  );

  for (const run of result.data) {
    const parsed = parseWorkflowName(run.workflowName);
    const shortName = parsed?.shortName;
    if (!shortName) continue;
    const bucket = grouped[shortName];
    if (!bucket || bucket.length >= PER_WORKFLOW_LIMIT) continue;
    bucket.push({
      runId: run.runId,
      status: run.status,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    });
  }

  return Response.json({ workflows: grouped });
}
