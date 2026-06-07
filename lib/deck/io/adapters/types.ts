import type { Zone } from "@/lib/generated/prisma/enums";
import type { ParsedDecklist } from "../parse";

export type AdapterId = "text" | "arena" | "dek" | "json";
export type SerializerId = "text" | "arena";

type SerializeCard = { name: string };

type SerializePrinting = {
  setCode: string;
  collectorNumber: string;
} | null;

export type DeckCardWithDetails = {
  quantity: number;
  zone: Zone;
  category: string | null;
  isFoil: boolean;
  printingId: number | null | undefined;
  card: SerializeCard;
  printing: SerializePrinting;
};

export type DeckWithCards = {
  name: string;
  format: string;
  visibility: string;
  description: string | null | undefined;
  cards: DeckCardWithDetails[];
  categories: { name: string; sortOrder: number }[];
};

export interface DecklistParser {
  readonly id: AdapterId;
  detect(input: string): number;
  parse(input: string): ParsedDecklist;
}

export interface DecklistSerializer {
  readonly id: SerializerId;
  serialize(deck: DeckWithCards): string;
}
