import { z } from "zod";

const ScryfallImageUrisSchema = z
  .object({
    normal: z.string().optional(),
    small: z.string().optional(),
    large: z.string().optional(),
    png: z.string().optional(),
    art_crop: z.string().optional(),
    border_crop: z.string().optional(),
  })
  .passthrough();

const ScryfallCardFaceSchema = z
  .object({
    image_uris: ScryfallImageUrisSchema.optional(),
  })
  .passthrough();

const ScryfallPricesSchema = z
  .object({
    usd: z.string().nullable().optional(),
    usd_foil: z.string().nullable().optional(),
    usd_etched: z.string().nullable().optional(),
    eur: z.string().nullable().optional(),
    eur_foil: z.string().nullable().optional(),
    eur_etched: z.string().nullable().optional(),
    tix: z.string().nullable().optional(),
  })
  .passthrough();

const ScryfallCardPartSchema = z
  .object({
    id: z.string(),
    component: z.enum(["token", "meld_part", "meld_result", "combo_piece"]),
    name: z.string(),
    type_line: z.string(),
    uri: z.string(),
  })
  .passthrough();

// .passthrough() ensures Scryfall adding new fields never causes a parse
// failure — we store what we know and ignore the rest.
export const ScryfallCardSchema = z
  .object({
    id: z.string(),
    lang: z.string(),
    layout: z.string(),
    games: z.array(z.string()),
    name: z.string().min(1),
    type_line: z.string().optional(),
    oracle_text: z.string().optional(),
    mana_cost: z.string().optional(),
    cmc: z.number().optional(),
    colors: z.array(z.string()).optional(),
    color_identity: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    power: z.string().optional(),
    toughness: z.string().optional(),
    legalities: z.record(z.string(), z.string()).optional(),
    reserved: z.boolean().optional(),
    game_changer: z.boolean().optional(),
    rarity: z.string().optional(),
    set: z.string(),
    set_name: z.string(),
    collector_number: z.string(),
    promo_types: z.array(z.string()).optional(),
    finishes: z.array(z.string()).optional(),
    image_uris: ScryfallImageUrisSchema.optional(),
    card_faces: z.array(ScryfallCardFaceSchema).optional(),
    prices: ScryfallPricesSchema.optional(),
    all_parts: z.array(ScryfallCardPartSchema).optional(),
  })
  .passthrough();
