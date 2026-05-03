import { scryfallIngestWorkflow } from "@/workflows/scryfall/ingest";
import { createCronWorkflowHandler } from "./_handler";

const handler = createCronWorkflowHandler(scryfallIngestWorkflow);

export const POST = handler;
export const GET = handler;
