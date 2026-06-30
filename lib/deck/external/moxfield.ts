import "server-only";
import { notFound } from "next/navigation";
import { type Format, type Zone } from "@/lib/generated/prisma/enums";
import { detectExternalSource } from "../external-deck-url";
import { ExternalFetchError, fetchWithTimeout, type ExternalDeckRaw, type ExternalSourceAdapter } from "./types";

const FORMAT: Record<string, Format> = {
  commander: "COMMANDER",
  standard: "STANDARD",
  pioneer: "PIONEER",
  modern: "MODERN",
  legacy: "LEGACY",
  vintage: "VINTAGE",
  pauper: "PAUPER",
  oathbreaker: "OATHBREAKER",
  brawl: "BRAWL",
  historic: "HISTORIC",
  explorer: "EXPLORER",
  alchemy: "ALCHEMY",
  casual: "CASUAL",
};

const BOARD_ZONE: Record<string, Zone> = {
  mainboard: "MAINBOARD",
  commanders: "COMMANDER",
  sideboard: "SIDEBOARD",
  maybeboard: "CONSIDERING",
  companions: "SIDEBOARD",
  attractions: "MAINBOARD",
  stickers: "MAINBOARD",
};

export const moxfieldAdapter: ExternalSourceAdapter = {
  id: "moxfield",

  detect: (url) => detectExternalSource(url) === "moxfield",

  async fetch(url): Promise<ExternalDeckRaw> {
    const match = url.match(/moxfield\.com\/decks\/([^/?#]+)/);
    if (!match) notFound();
    const deckId = match[1];

    let res: Response;
    try {
      res = await fetchWithTimeout(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
        headers: { "User-Agent": "maindeck/1.0 (deck comparison)" },
        next: { revalidate: 300 },
      });
    } catch {
      throw new ExternalFetchError(
        "Could not reach Moxfield. Check that the deck is public and try again.",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new ExternalFetchError(
        "Moxfield's API blocks server-side requests. Export your deck as text from Moxfield and paste it instead.",
      );
    }
    if (!res.ok) {
      throw new ExternalFetchError(
        `Moxfield returned ${res.status}. Check that the deck is public.`,
      );
    }

    const data = await res.json();

    const entries = [];
    for (const [board, zone] of Object.entries(BOARD_ZONE)) {
      const boardCards = (data.boards?.[board]?.cards ?? {}) as Record<string, unknown>;
      for (const entry of Object.values(boardCards)) {
        const e = entry as { card?: { name?: string }; quantity?: number };
        const name = e?.card?.name;
        if (name) entries.push({ name, quantity: e?.quantity ?? 1, zone });
      }
    }

    return {
      name: data.name ?? "Moxfield Deck",
      format: FORMAT[String(data.format ?? "").toLowerCase()] ?? "CASUAL",
      entries,
    };
  },
};
