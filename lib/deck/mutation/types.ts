import type { Format, Zone } from "@/lib/generated/prisma/enums";

export type LegalityIssue = { code: string; message: string };

export type PlannedChange =
  | {
      op: "add";
      cardId: number;
      quantity: number;
      zone: Zone;
      category: string | null;
      printingId?: number | null;
      isFoil?: boolean;
    }
  | { op: "remove"; deckCardId: string }
  | { op: "update"; deckCardId: string; quantity: number }
  | {
      op: "move";
      deckCardId: string;
      zone: Zone;
      category: string | null;
    };

export type SnapshotCard = {
  id: string;
  cardId: number;
  cardName: string;
  zone: Zone;
  category: string | null;
  quantity: number;
  typeLine: string | null;
  colorIdentity: string[];
  legalities: Record<string, string>;
  printingId: number | null;
  isFoil: boolean;
};

export type DeckSnapshot = {
  deckId: string;
  format: Format;
  cards: SnapshotCard[];
  categoryNames: string[];
  cardMeta: Map<
    number,
    {
      name: string;
      typeLine: string | null;
      colorIdentity: string[];
      legalities: Record<string, string>;
    }
  >;
};
