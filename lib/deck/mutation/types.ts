import type { Format, Zone } from "@/lib/generated/prisma/enums";
import type { Legalities } from "@/lib/card/types-meta";

export type LegalityIssue =
  | { kind: "deck_size"; expected: number; actual: number }
  | { kind: "no_commander" }
  | { kind: "sideboard_size"; expected: number; actual: number }
  | { kind: "card_banned"; cardName: string }
  | { kind: "card_restricted"; cardName: string }
  | { kind: "card_not_legal"; cardName: string }
  | { kind: "singleton_violation"; cardName: string; quantity: number }
  | { kind: "color_identity_violation"; cardName: string; offending: string[] }
  | { kind: "companion_violation"; cardName: string; reason: string }
  | { kind: "category_zone_mismatch" };

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
  legalities: Legalities;
  printingId: number | null;
  isFoil: boolean;
  isNew?: boolean;
  /** Companion-restriction inputs; optional so non-deck snapshots can omit them. */
  cmc?: number | null;
  manaCost?: string | null;
  oracleText?: string | null;
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
      legalities: Legalities;
    }
  >;
};
