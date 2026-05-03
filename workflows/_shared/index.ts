// Cross-workflow utilities. Per the workflow DevKit docs, this is the
// canonical home for steps shared between workflows
// (`node_modules/workflow/docs/foundations/workflows-and-steps.mdx` lines
// 182–203). Each workflow imports the lock + checkpoint primitives from here
// and keeps its own `source` identity string locally.
export {
  acquireIngestLock,
  releaseIngestLock,
  INGEST_LOCK_STALE_MS,
} from "./ingest-lock";
export { getLastCheckpoint, writeCheckpoint } from "./checkpoint";
