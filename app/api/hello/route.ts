import { start } from "workflow/api";
import { helloWorkflow } from "@/workflows/hello";

export const runtime = "nodejs";

export async function POST() {
  const run = await start(helloWorkflow);
  return Response.json({ runId: run.runId });
}
