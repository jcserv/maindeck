import { ScryfallCardSchema } from "./schema";
import type { ScryfallCard } from "./types";

type BulkManifestEntry = {
  type: string;
  download_uri: string;
  updated_at: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function parseManifestEntries(value: unknown): BulkManifestEntry[] {
  if (!isObject(value) || !Array.isArray(value.data)) {
    throw new Error("bulk-data manifest: malformed response");
  }
  const entries: BulkManifestEntry[] = [];
  for (const raw of value.data) {
    if (
      isObject(raw) &&
      isString(raw.type) &&
      isString(raw.download_uri) &&
      isString(raw.updated_at)
    ) {
      entries.push({
        type: raw.type,
        download_uri: raw.download_uri,
        updated_at: raw.updated_at,
      });
    }
  }
  return entries;
}

// Returns null when the row fails schema validation. Using Zod moves the
// failure to the ingestion boundary so downstream mapping never receives
// partially-valid data.
export function parseScryfallCard(value: unknown): ScryfallCard | null {
  const result = ScryfallCardSchema.safeParse(value);
  return result.success ? result.data : null;
}
