import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Rarity } from "@/lib/generated/prisma/enums";
import { toNameSlug } from "@/lib/utils";
import { normalizeLegalities } from "./formats";
import { filterKeywords } from "./keywords";
import type { ScryfallCard } from "./types";
import { getMainType } from "./types-card";

const VALID_RARITIES = new Set<Rarity>([
  "Common",
  "Uncommon",
  "Rare",
  "Mythic",
  "Special",
  "Bonus",
]);

function normalizeRarity(raw: string | undefined): Rarity | null {
  if (!raw) return null;
  const capitalized =
    raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return VALID_RARITIES.has(capitalized as Rarity)
    ? (capitalized as Rarity)
    : null;
}

// Hashes an object after sorting keys, so the digest is independent of property
// declaration order. Adding a field automatically participates in the hash.
export function hashObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = obj[k];
  return createHash("md5").update(JSON.stringify(ordered)).digest("hex");
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

  // Empty slug → null so unique constraint treats each as distinct.
  const slug = toNameSlug(card.name);
  const base = {
    name: card.name,
    nameSlug: slug.length > 0 ? slug : null,
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

  return { ...base, version: hashObject(base) };
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
    priceEurEtched: parsePrice(card.prices?.eur_etched),
    rarity: normalizeRarity(card.rarity),
  };

  return { ...base, version: hashObject(base) };
}
