import { preconIngestWorkflow } from "@/workflows/precon/ingest";
import { createCronWorkflowHandler } from "../_handler";

const handler = createCronWorkflowHandler(preconIngestWorkflow);

export const POST = handler;
export const GET = handler;
