"use server";

import {
  getPublicDecksWithPreview,
  selectDeckPreviewImages,
  type PublicDeckWithPreview,
} from "@/lib/deck/queries";
import { type Format } from "@/lib/generated/prisma/enums";

export interface ParsedFilters {
  q?: string;
  format?: Format;
  colors?: string[];
  commander?: string;
  source?: "all" | "community" | "official";
  sort?: "updated" | "created" | "released";
}

export interface LoadMoreResult {
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
  const { decks, total } = await getPublicDecksWithPreview({
    page,
    pageSize,
    ...filters,
  });

  const loaded = (page - 1) * pageSize + decks.length;
  return {
    decks: decks.map(serialize),
    hasMore: loaded < total,
  };
}
