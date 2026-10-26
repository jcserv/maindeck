import "server-only";
import { archidektAdapter } from "./archidekt";
import { moxfieldAdapter } from "./moxfield";
import type { ExternalSourceAdapter } from "./types";

const externalSources: readonly ExternalSourceAdapter[] = [
  archidektAdapter,
  moxfieldAdapter,
];

export function getSourceForUrl(url: string): ExternalSourceAdapter | null {
  return externalSources.find((s) => s.detect(url)) ?? null;
}

export { ExternalFetchError } from "./types";
