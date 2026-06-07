"use server";

import { z } from "zod";
import {
  getPublicDecksWithPreview,
  selectDeckPreviewImages,
  type PublicDeckWithPreview,
} from "@/lib/deck/queries";
import { Format } from "@/lib/generated/prisma/enums";

const argsSchema = z.object({
  page: z
    .number()
    .int()
    .positive()
    .transform((v) => Math.min(v, 10_000))
    .catch(1),
  pageSize: z
    .number()
    .int()
    .positive()
    .transform((v) => Math.min(v, 48))
    .catch(24),
  filters: z
    .object({
      q: z.string().max(200).optional(),
      format: z.enum(Format).optional().catch(undefined),
      colors: z
        .array(z.enum(["W", "U", "B", "R", "G"]))
        .optional()
        .catch(undefined),
      commander: z.string().max(200).optional(),
      source: z
        .enum(["all", "community", "official"])
        .optional()
        .catch(undefined),
      sort: z
        .enum(["updated", "created", "released"])
        .optional()
        .catch(undefined),
    })
    .default({}),
});

export interface ParsedFilters {
  q?: string;
  format?: Format;
  colors?: string[];
  commander?: string;
  source?: "all" | "community" | "official";
  sort?: "updated" | "created" | "released";
}

interface LoadMoreResult {
  decks: SerializedDeck[];
  hasMore: boolean;
}

/** Serialized subset of PublicDeckWithPreview safe to send over the wire. */
export interface SerializedDeck {
  id: string;
  name: string;
  format: Format;
  visibility: PublicDeckWithPreview["visibility"];
  cardCount: number;
  updatedAt: string;
  releasedAt: string | null;
  previewImages: string[];
  isOfficial: boolean;
  commanderName: string | null;
}

function serialize(deck: PublicDeckWithPreview): SerializedDeck {
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    visibility: deck.visibility,
    cardCount: deck.cardCount,
    updatedAt: deck.updatedAt instanceof Date
      ? deck.updatedAt.toISOString()
      : deck.updatedAt,
    releasedAt: deck.releasedAt
      ? deck.releasedAt instanceof Date
        ? deck.releasedAt.toISOString()
        : deck.releasedAt
      : null,
    previewImages: selectDeckPreviewImages(deck.format, deck.cards),
    isOfficial: deck.isOfficial,
    commanderName: deck.commanderName,
  };
}

export async function loadMorePublicDecks(
  filters: ParsedFilters,
  page: number,
  pageSize: number,
): Promise<LoadMoreResult> {
  const parsed = argsSchema.parse({ page, pageSize, filters });

  const f = parsed.filters;
  const { decks, total } = await getPublicDecksWithPreview({
    page: parsed.page,
    pageSize: parsed.pageSize,
    ...(f.q !== undefined && { q: f.q }),
    ...(f.format !== undefined && { format: f.format }),
    ...(f.colors !== undefined && { colors: f.colors }),
    ...(f.commander !== undefined && { commander: f.commander }),
    ...(f.source !== undefined && { source: f.source }),
    ...(f.sort !== undefined && { sort: f.sort }),
  });

  const loaded = (parsed.page - 1) * parsed.pageSize + decks.length;
  return {
    decks: decks.map(serialize),
    hasMore: loaded < total,
  };
}
