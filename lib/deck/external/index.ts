import "server-only";
import { archidektAdapter } from "./archidekt";
import { moxfieldAdapter } from "./moxfield";
import type { ExternalSourceAdapter, ExternalSourceId } from "./types";

export const externalSources: readonly ExternalSourceAdapter[] = [
  archidektAdapter,
  moxfieldAdapter,
];

export const SOURCE_BY_ID: Record<ExternalSourceId, ExternalSourceAdapter> = {
  archidekt: archidektAdapter,
  moxfield: moxfieldAdapter,
};

export function getSourceForUrl(url: string): ExternalSourceAdapter | null {
  return externalSources.find((s) => s.detect(url)) ?? null;
}

export type { ExternalSourceId, ExternalDeckRaw, ExternalEntry, ExternalSourceAdapter } from "./types";
export { ExternalFetchError } from "./types";
