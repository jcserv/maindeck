import { fetchWithRetry } from "@/lib/http";

const USER_AGENT = "maindeck/0.1";
const MTGJSON_BASE = "https://mtgjson.com/api/v5";

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
  if (!res.ok) throw new Error(`mtgjson Meta.json: ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!isObject(body) || !isObject(body.data)) {
    throw new Error("mtgjson Meta.json: malformed response");
  }
  const { version, date } = body.data;
  if (typeof version !== "string" || typeof date !== "string") {
    throw new Error("mtgjson Meta.json: missing version/date");
  }
  return { version, date };
}

export async function fetchMtgjsonDeckList(): Promise<MtgjsonDeckIndexEntry[]> {
  const res = await fetchWithRetry(`${MTGJSON_BASE}/DeckList.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`mtgjson DeckList.json: ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!isObject(body) || !Array.isArray(body.data)) {
    throw new Error("mtgjson DeckList.json: malformed response");
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
  if (!res.ok) throw new Error(`mtgjson decks/${fileName}: ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!isObject(body) || !isObject(body.data)) {
    throw new Error(`mtgjson decks/${fileName}: malformed response`);
  }
  const d = body.data;
  if (
    typeof d.code !== "string" ||
    typeof d.name !== "string" ||
    typeof d.type !== "string" ||
    typeof d.releaseDate !== "string"
  ) {
    throw new Error(`mtgjson decks/${fileName}: missing required fields`);
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
