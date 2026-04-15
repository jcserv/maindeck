import type { ScryfallCard } from "./types";

export type BulkManifestEntry = {
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

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
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

// Returns null when the row is too malformed to upsert. Required Scryfall
// fields for downstream mapping: id, lang, layout, games, name, set, set_name,
// collector_number.
export function parseScryfallCard(value: unknown): ScryfallCard | null {
  if (!isObject(value)) return null;
  if (!isString(value.id)) return null;
  if (!isString(value.lang)) return null;
  if (!isString(value.layout)) return null;
  if (!isStringArray(value.games)) return null;
  if (!isString(value.name) || value.name === "") return null;
  if (!isString(value.set)) return null;
  if (!isString(value.set_name)) return null;
  if (!isString(value.collector_number)) return null;
  return value as unknown as ScryfallCard;
}
