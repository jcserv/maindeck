import { getRun } from "workflow/api";
import { getEnv } from "@/lib/env";
import { bearerMatches } from "../../_auth";

// Streams per-batch progress entries written by the ingest workflow on the
// `progress` namespace. The shape of each chunk is owned by the workflow
// (workflows/scryfall/steps.ts → upsertBatch); this route just plumbs the
// readable side through.
//
// The stream is bounded to 5 minutes via AbortSignal.timeout, mirroring the
// BULK_DOWNLOAD_TIMEOUT_MS pattern in workflows/scryfall/steps.ts:42.
// An unbound SSE stream holds a pooled connection indefinitely.
//
// Refs:
// - node_modules/workflow/docs/api-reference/workflow-api/get-run.mdx
// - node_modules/workflow/docs/foundations/streaming.mdx (lines 218–289 for
//   namespaced streams)

const PROGRESS_STREAM_TIMEOUT_MS = 5 * 60_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!bearerMatches(req.headers.get("authorization"), getEnv().CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const run = getRun(runId);
  if (!(await run.exists)) {
    return new Response("Not found", { status: 404 });
  }

  const signal = AbortSignal.timeout(PROGRESS_STREAM_TIMEOUT_MS);
  const source = run.getReadable({ namespace: "progress" });

  // Bound stream lifetime: pipe source through a TransformStream so we can
  // cancel the downstream readable when the timeout fires.  The workflow
  // readable has no built-in AbortSignal support, so we cancel the reader on
  // the source side when the signal fires.
  const { readable, writable } = new TransformStream();
  signal.addEventListener("abort", () => {
    void source.cancel().catch(() => undefined);
  });
  void source.pipeTo(writable).catch(() => undefined);

  return new Response(readable, {
    headers: { "content-type": "text/event-stream" },
  });
}
