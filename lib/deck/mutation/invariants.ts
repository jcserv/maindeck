import { Zone } from "@/lib/generated/prisma/enums";
import {
  checkColorIdentity,
  checkPerCardLegality,
  checkSingleton,
} from "./legality-rules";
import type {
  DeckSnapshot,
  LegalityIssue,
  PlannedChange,
  SnapshotCard,
} from "./types";

function makeDeckCardId(): string {
  return `__projected__${Math.random().toString(36).slice(2)}`;
}

function findRow(
  cards: SnapshotCard[],
  cardId: number,
  zone: Zone,
  category: string | null,
): SnapshotCard | undefined {
  return cards.find(
    (c) => c.cardId === cardId && c.zone === zone && c.category === category,
  );
}

export function projectChanges(
  before: DeckSnapshot,
  changes: readonly PlannedChange[],
): DeckSnapshot {
  const cards: SnapshotCard[] = before.cards.map((c) => ({ ...c }));

  for (const change of changes) {
    if (change.op === "add") {
      const meta = before.cardMeta.get(change.cardId);
      const existing = findRow(
        cards,
        change.cardId,
        change.zone,
        change.category,
      );
      if (existing) {
        existing.quantity += change.quantity;
      } else {
        cards.push({
          id: makeDeckCardId(),
          cardId: change.cardId,
          cardName: meta?.name ?? `card:${change.cardId}`,
          zone: change.zone,
          category: change.category,
          quantity: change.quantity,
          typeLine: meta?.typeLine ?? null,
          colorIdentity: meta?.colorIdentity ?? [],
          legalities: meta?.legalities ?? {},
          printingId: change.printingId ?? null,
          isFoil: change.isFoil ?? false,
        });
      }
    } else if (change.op === "remove") {
      const idx = cards.findIndex((c) => c.id === change.deckCardId);
      if (idx !== -1) cards.splice(idx, 1);
    } else if (change.op === "update") {
      const row = cards.find((c) => c.id === change.deckCardId);
      if (!row) continue;
      if (change.quantity <= 0) {
        cards.splice(cards.indexOf(row), 1);
      } else {
        row.quantity = change.quantity;
      }
    } else {
      const row = cards.find((c) => c.id === change.deckCardId);
      if (!row) continue;
      const target = findRow(
        cards,
        row.cardId,
        change.zone,
        change.category,
      );
      if (target && target.id !== row.id) {
        target.quantity += row.quantity;
        cards.splice(cards.indexOf(row), 1);
      } else {
        row.zone = change.zone;
        row.category = change.category;
      }
    }
  }

  return { ...before, cards };
}

export function checkStructural(
  changes: readonly PlannedChange[],
): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  for (const change of changes) {
    if (change.op === "add" || change.op === "move") {
      if (change.category !== null && change.zone !== Zone.MAINBOARD) {
        issues.push({
          code: "category_zone_mismatch",
          message: "Subcategories only apply to MAINBOARD cards",
        });
      }
    }
  }
  return issues;
}

function gatedIssues(snap: DeckSnapshot): LegalityIssue[] {
  return [
    ...checkPerCardLegality(snap),
    ...checkSingleton(snap),
    ...checkColorIdentity(snap),
  ];
}

export function checkInvariants(
  before: DeckSnapshot,
  after: DeckSnapshot,
  changes: readonly PlannedChange[],
): LegalityIssue[] {
  const structural = checkStructural(changes);
  if (structural.length > 0) return structural;

  const beforeMessages = new Set(gatedIssues(before).map((i) => i.message));
  const afterIssues = gatedIssues(after);
  return afterIssues.filter((i) => !beforeMessages.has(i.message));
}
