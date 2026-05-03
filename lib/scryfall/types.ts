import { z } from "zod";
import type { Format } from "@/lib/generated/prisma/enums";
import { ScryfallCardSchema } from "./schema";

export type ScryfallCard = z.infer<typeof ScryfallCardSchema>;

export type LegalityStatus = "legal" | "not_legal" | "banned" | "restricted";

/**
 * Maps lowercased Prisma Format keys to their Scryfall legality status.
 * Keys are lowercase to match Scryfall's wire format (e.g. "commander",
 * "standard") rather than the uppercase Prisma enum values.
 */
export type Legalities = Partial<Record<Lowercase<Format>, LegalityStatus>>;
