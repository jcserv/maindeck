import { FatalError, RetryableError } from "workflow";
import { fetchWithRetry } from "@/lib/http";

const USER_AGENT = "maindeck/0.1";
const MTGJSON_BASE = "https://mtgjson.com/api/v5";

// Parse an HTTP `Retry-After` header value. Per RFC 7231 it's either a
// non-negative integer number of seconds, or an HTTP-date.
function parseRetryAfter(value: string | null): number | Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Classify an HTTP failure for the workflow runtime: 429 honors `Retry-After`,
// everything else is treated as a permanent client-side failure. 5xx never
// reaches here in practice — `fetchWithRetry` retries 5xx and surfaces a
// plain Error of its own once attempts are exhausted, so this helper only
// runs against responses that fell through (200-range — already handled by
// callers — and 4xx).
// See `node_modules/workflow/docs/foundations/errors-and-retries.mdx` and
// `node_modules/workflow/docs/api-reference/workflow/{fatal-error,retryable-error}.mdx`.
function throwForStatus(label: string, res: Response): never {
  const status = res.status;
  if (status === 429) {
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    const opts = retryAfter !== undefined ? { retryAfter } : undefined;
    throw new RetryableError(`${label}: 429 rate limited`, opts);
  }
  throw new FatalError(`${label}: ${status}`);
}

export type MtgjsonMeta = {
  version: string;
  date: string;
};

export type MtgjsonDeckIndexEntry = {
  code: string;
  fileName: string;
  name: string;
  releaseDate: string;
};

export type MtgjsonDeckCard = {
  name: string;
  count: number;
};

export type MtgjsonDeckFile = {
  code: string;
  name: string;
  type: string;
  releaseDate: string;
  commander: MtgjsonDeckCard[];
  mainBoard: MtgjsonDeckCard[];
  sideBoard: MtgjsonDeckCard[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseDeckCards(value: unknown): MtgjsonDeckCard[] {
  if (!Array.isArray(value)) return [];
  const out: MtgjsonDeckCard[] = [];
  for (const raw of value) {
    if (!isObject(raw)) continue;
    if (typeof raw.name !== "string" || raw.name === "") continue;
    const count = typeof raw.count === "number" ? raw.count : 0;
    if (count <= 0) continue;
    out.push({ name: raw.name, count });
  }
  return out;
}

export async function fetchMtgjsonMeta(): Promise<MtgjsonMeta> {
  const res = await fetchWithRetry(`${MTGJSON_BASE}/Meta.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throwForStatus("mtgjson Meta.json", res);
  const body = (await res.json()) as unknown;
  if (!isObject(body) || !isObject(body.data)) {
    throw new FatalError("mtgjson Meta.json: malformed response");
  }
  const { version, date } = body.data;
  if (typeof version !== "string" || typeof date !== "string") {
    throw new FatalError("mtgjson Meta.json: missing version/date");
  }
  return { version, date };
}

export async function fetchMtgjsonDeckList(): Promise<MtgjsonDeckIndexEntry[]> {
  const res = await fetchWithRetry(`${MTGJSON_BASE}/DeckList.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throwForStatus("mtgjson DeckList.json", res);
  const body = (await res.json()) as unknown;
  if (!isObject(body) || !Array.isArray(body.data)) {
    throw new FatalError("mtgjson DeckList.json: malformed response");
  }
  const out: MtgjsonDeckIndexEntry[] = [];
  for (const raw of body.data) {
    if (!isObject(raw)) continue;
    if (
      typeof raw.code !== "string" ||
      typeof raw.fileName !== "string" ||
      typeof raw.name !== "string" ||
      typeof raw.releaseDate !== "string"
    ) {
      continue;
    }
    out.push({
      code: raw.code,
      fileName: raw.fileName,
      name: raw.name,
      releaseDate: raw.releaseDate,
    });
  }
  return out;
}

export async function fetchMtgjsonDeck(
  fileName: string,
): Promise<MtgjsonDeckFile> {
  // DeckList.json returns fileNames without the `.json` suffix
  // (e.g. "ArcanisSGuile_10E"), but the file URLs require it.
  const path = fileName.endsWith(".json") ? fileName : `${fileName}.json`;
  const res = await fetchWithRetry(`${MTGJSON_BASE}/decks/${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  // Per-fetch failures are caught by `downloadAndStagePrecons` and counted
  // as `failedFetches` (the per-deck file-missing case is normal — mtgjson
  // occasionally lists decks whose files 404). Classifying still helps
  // operators distinguish "this single deck is gone forever" (4xx FatalError)
  // from "mtgjson is having a moment" (5xx RetryableError) in logs.
  if (!res.ok) throwForStatus(`mtgjson decks/${fileName}`, res);
  const body = (await res.json()) as unknown;
  if (!isObject(body) || !isObject(body.data)) {
    throw new FatalError(`mtgjson decks/${fileName}: malformed response`);
  }
  const d = body.data;
  if (
    typeof d.code !== "string" ||
    typeof d.name !== "string" ||
    typeof d.type !== "string" ||
    typeof d.releaseDate !== "string"
  ) {
    throw new FatalError(
      `mtgjson decks/${fileName}: missing required fields`,
    );
  }
  return {
    code: d.code,
    name: d.name,
    type: d.type,
    releaseDate: d.releaseDate,
    commander: parseDeckCards(d.commander),
    mainBoard: parseDeckCards(d.mainBoard),
    sideBoard: parseDeckCards(d.sideBoard),
  };
}
