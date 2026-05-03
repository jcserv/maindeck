import { getRun } from "workflow/api";

// Streams per-batch progress entries written by the ingest workflow on the
// `progress` namespace. The shape of each chunk is owned by the workflow
// (workflows/scryfall/steps.ts → upsertBatch); this route just plumbs the
// readable side through.
//
// Refs:
// - node_modules/workflow/docs/api-reference/workflow-api/get-run.mdx
// - node_modules/workflow/docs/foundations/streaming.mdx (lines 218–289 for
//   namespaced streams)
export async function GET(
  _: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!(await run.exists)) {
    return new Response("Not found", { status: 404 });
  }
  const readable = run.getReadable({ namespace: "progress" });
  return new Response(readable, {
    headers: { "content-type": "text/event-stream" },
  });
}
