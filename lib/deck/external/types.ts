import type { Format, Zone } from "@/lib/generated/prisma/enums";
import type { ExternalSource } from "../external-deck-url";

export type ExternalSourceId = ExternalSource;

export type ExternalEntry = {
  name: string;
  quantity: number;
  zone: Zone;
};

export type ExternalDeckRaw = {
  name: string;
  format: Format;
  entries: ExternalEntry[];
};

export interface ExternalSourceAdapter {
  readonly id: ExternalSourceId;
  detect(url: string): boolean;
  fetch(url: string): Promise<ExternalDeckRaw>;
}

export class ExternalFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalFetchError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } },
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
