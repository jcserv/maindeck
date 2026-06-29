import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { type Format } from "@/lib/generated/prisma/enums";
import { detectFormat, parseDecklist } from "./io/parse";
import { resolveCardNames } from "./io/card-resolver";
import { getSourceForUrl, ExternalFetchError } from "./external/index";
import type { ComparableDeck, ComparableDeckCard } from "./compare";

// Re-export so existing importers (compare-queries, page) don't need path updates.
export { ExternalFetchError };

// ─── Card name → ComparableDeckCard resolution ───────────────────────────────

async function resolveEntriesToCards(
  entries: { name: string; quantity: number; zone: import("@/lib/generated/prisma/enums").Zone }[],
): Promise<ComparableDeckCard[]> {
  const names = [...new Set(entries.map((e) => e.name))];

  const dbCards = await prisma.card.findMany({
    where: { name: { in: names } },
    select: {
      id: true,
      name: true,
      mainType: true,
      typeLine: true,
      oracleText: true,
      manaCost: true,
      cmc: true,
      colors: true,
    },
  });

  const byName = new Map(dbCards.map((c) => [c.name, c]));

  const result: ComparableDeckCard[] = [];
  for (const entry of entries) {
    const card = byName.get(entry.name);
    if (!card) continue;
    result.push({
      quantity: entry.quantity,
      zone: entry.zone,
      cardId: card.id,
      card: {
        mainType: card.mainType,
        typeLine: card.typeLine,
        oracleText: card.oracleText,
        manaCost: card.manaCost,
        cmc: card.cmc,
        colors: card.colors,
        name: card.name,
      },
      printing: null,
    });
  }
  return result;
}

// ─── External URL fetch ───────────────────────────────────────────────────────

export async function fetchExternalComparableDeck(url: string): Promise<ComparableDeck> {
  const source = getSourceForUrl(url);
  if (!source) notFound();

  const raw = await source.fetch(url);
  const cards = await resolveEntriesToCards(raw.entries);

  return {
    id: url.trim(),
    name: raw.name,
    format: raw.format,
    cards,
  };
}

// ─── Text decklist ────────────────────────────────────────────────────────────

function extractDecklistName(text: string): string {
  for (const line of text.split("\n").slice(0, 5)) {
    const m = line.match(/^\/\/\s*(.+)/);
    if (m && m[1] && !m[1].match(/^(deck|sideboard|commander|maybeboard)/i)) {
      return m[1].trim();
    }
  }
  return "Pasted decklist";
}

export async function buildComparableDeckFromText(text: string): Promise<ComparableDeck> {
  const parsed = parseDecklist(text, detectFormat(text));
  const resolved = await resolveCardNames(parsed.cards);

  const cardIds = [
    ...new Set(resolved.filter((r) => r.cardId !== null).map((r) => r.cardId as number)),
  ];

  const dbCards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      name: true,
      mainType: true,
      typeLine: true,
      oracleText: true,
      manaCost: true,
      cmc: true,
      colors: true,
    },
  });

  const byId = new Map(dbCards.map((c) => [c.id, c]));

  const cards: ComparableDeckCard[] = resolved
    .filter((r): r is typeof r & { cardId: number } => r.cardId !== null)
    .flatMap((r) => {
      const card = byId.get(r.cardId);
      if (!card) return [];
      return [
        {
          quantity: r.parsed.quantity,
          zone: r.parsed.zone,
          cardId: r.cardId,
          card: {
            mainType: card.mainType,
            typeLine: card.typeLine,
            oracleText: card.oracleText,
            manaCost: card.manaCost,
            cmc: card.cmc,
            colors: card.colors,
            name: card.name,
          },
          printing: null,
        },
      ];
    });

  return {
    id: "text-import",
    name: extractDecklistName(text),
    format: "COMMANDER" as Format,
    cards,
  };
}
