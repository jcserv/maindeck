import { fetchBulkManifest, streamAndUpsertAll } from "./steps";

export async function scryfallIngestWorkflow() {
  "use workflow";
  const manifest = await fetchBulkManifest();
  const stats = await streamAndUpsertAll(manifest.downloadUri);
  return { updatedAt: manifest.updatedAt, ...stats };
}
