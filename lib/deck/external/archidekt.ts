import "server-only";
import { notFound } from "next/navigation";
import { type Format, type Zone } from "@/lib/generated/prisma/enums";
import { detectExternalSource } from "../external-deck-url";
import { ExternalFetchError, fetchWithTimeout, type ExternalDeckRaw, type ExternalSourceAdapter } from "./types";

const FORMAT: Record<number, Format> = {
  1: "STANDARD",
  2: "MODERN",
  3: "COMMANDER",
  4: "LEGACY",
  5: "VINTAGE",
  6: "PAUPER",
  7: "CASUAL",
  8: "HISTORIC",
  11: "OATHBREAKER",
};

// Archidekt encodes zone via category strings. Any unrecognised category
// defaults to MAINBOARD — user-defined labels like "Ramp" or "Removal" fall
// through correctly.
const CATEGORY_ZONE: Record<string, Zone> = {
  commander: "COMMANDER",
  mainboard: "MAINBOARD",
  sideboard: "SIDEBOARD",
  maybeboard: "CONSIDERING",
};

export const archidektAdapter: ExternalSourceAdapter = {
  id: "archidekt",

  detect: (url) => detectExternalSource(url) === "archidekt",

  async fetch(url): Promise<ExternalDeckRaw> {
    const match = url.match(/archidekt\.com\/decks\/(\d+)/);
    if (!match) notFound();
    const deckId = match[1];

    let res: Response;
    try {
      res = await fetchWithTimeout(`https://archidekt.com/api/decks/${deckId}/`, {
        headers: { "User-Agent": "maindeck/1.0 (deck comparison)" },
        next: { revalidate: 300 },
      });
    } catch {
      throw new ExternalFetchError(
        "Could not reach Archidekt. Check that the deck is public and try again.",
      );
    }
    if (!res.ok) {
      throw new ExternalFetchError(
        `Archidekt returned ${res.status}. Check that the deck is public.`,
      );
    }

    const data = await res.json();

    const entries = [];
    for (const slot of (data.cards ?? []) as unknown[]) {
      const s = slot as {
        card?: { oracleCard?: { name?: string } };
        quantity?: number;
        categories?: string[];
      };
      const name = s?.card?.oracleCard?.name;
      if (!name) continue;

      const cats = (s.categories ?? []).map((c) => c.toLowerCase());
      let zone: Zone = "MAINBOARD";
      for (const cat of cats) {
        const mapped = CATEGORY_ZONE[cat];
        if (mapped) { zone = mapped; break; }
      }

      entries.push({ name, quantity: s.quantity ?? 1, zone });
    }

    return {
      name: data.name ?? "Archidekt Deck",
      format: FORMAT[data.deckFormat as number] ?? "CASUAL",
      entries,
    };
  },
};
