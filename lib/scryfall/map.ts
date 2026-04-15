import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { normalizeLegalities } from "./formats";
import { filterKeywords } from "./keywords";
import type { ScryfallCard } from "./types";
import { getMainType } from "./types-card";

function hashRow(parts: unknown[]): string {
  return createHash("md5").update(JSON.stringify(parts)).digest("hex");
}

const VALID_COLORS = new Set(["W", "U", "B", "R", "G"]);
const VALID_FINISHES = new Set(["nonfoil", "foil", "etched"]);

function normalizeColors(colors: string[] | undefined): string[] {
  if (!colors) return [];
  return colors.filter((c) => VALID_COLORS.has(c));
}

function normalizeGames(games: string[] | undefined): string[] {
  if (!games) return [];
  return games.filter((g) => g === "paper" || g === "mtgo" || g === "arena");
}

function normalizeFinishes(finishes: string[] | undefined): string[] {
  if (!finishes) return [];
  return finishes
    .map((f) => f.toLowerCase())
    .filter((f) => VALID_FINISHES.has(f));
}

function parsePrice(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return value;
}

function getImageUris(
  card: ScryfallCard,
): { imageUri: string | null; backImageUri: string | null } {
  if (card.image_uris?.normal) {
    return { imageUri: card.image_uris.normal, backImageUri: null };
  }
  // MDFC / transform cards carry images on card_faces instead.
  if (card.card_faces && card.card_faces.length > 0) {
    const front = card.card_faces[0];
    const back = card.card_faces[1];
    return {
      imageUri: front?.image_uris?.normal ?? null,
      backImageUri: back?.image_uris?.normal ?? null,
    };
  }
  return { imageUri: null, backImageUri: null };
}

export type CardCreateData = Prisma.CardCreateManyInput & { version: string };

export function toCardCreate(card: ScryfallCard): CardCreateData {
  if (!card.name) throw new Error("Card must have a name");

  const base = {
    name: card.name,
    mainType: getMainType(card.type_line),
    typeLine: card.type_line ?? null,
    oracleText: card.oracle_text ?? null,
    manaCost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    colors: normalizeColors(card.colors),
    colorIdentity: normalizeColors(card.color_identity),
    keywords: filterKeywords(card.keywords),
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    games: normalizeGames(card.games),
    legalities: normalizeLegalities(card.legalities),
    reserved: card.reserved ?? false,
    gameChanger: card.game_changer ?? false,
  };

  const version = hashRow([
    base.name,
    base.mainType,
    base.typeLine,
    base.oracleText,
    base.manaCost,
    base.cmc,
    base.colors,
    base.colorIdentity,
    base.keywords,
    base.power,
    base.toughness,
    base.games,
    base.legalities,
    base.reserved,
    base.gameChanger,
  ]);

  return { ...base, version };
}

export type PrintingCreateData = Omit<
  Prisma.PrintingUncheckedCreateInput,
  "id"
> & { version: string };

export function toPrintingCreate(
  cardId: number,
  card: ScryfallCard,
): PrintingCreateData {
  const { imageUri, backImageUri } = getImageUris(card);
  if (!imageUri) {
    throw new Error(`Printing ${card.id} has no image_uri`);
  }

  const base = {
    cardId,
    scryfallId: card.id,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    isSerialized: card.promo_types?.includes("serialized") ?? false,
    finishes: normalizeFinishes(card.finishes),
    imageUri,
    backImageUri,
    priceUsd: parsePrice(card.prices?.usd),
    priceUsdFoil: parsePrice(card.prices?.usd_foil),
    priceUsdEtched: parsePrice(card.prices?.usd_etched),
    priceEur: parsePrice(card.prices?.eur),
    priceEurFoil: parsePrice(card.prices?.eur_foil),
    priceEurEtched: null as string | null,
  };

  const version = hashRow([
    base.cardId,
    base.scryfallId,
    base.setCode,
    base.setName,
    base.collectorNumber,
    base.isSerialized,
    base.finishes,
    base.imageUri,
    base.backImageUri,
    base.priceUsd,
    base.priceUsdFoil,
    base.priceUsdEtched,
    base.priceEur,
    base.priceEurFoil,
    base.priceEurEtched,
  ]);

  return { ...base, version };
}
