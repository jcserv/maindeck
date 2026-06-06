import { Zone } from "@/lib/generated/prisma/enums";
import type {
  DeckSnapshot,
  LegalityIssue,
  PlannedChange,
  SnapshotCard,
} from "./types";

/**
 * A locally-unique id for a row `projectChanges` invented for an `add` with no
 * existing match. It only needs to stay unique for `Map`/`Set` keying — the
 * create op never reads it. New-ness is carried structurally by `isNew`, not by
 * the id.
 */
function makeDeckCardId(): string {
  return Math.random().toString(36).slice(2);
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

function findAddTarget(
  cards: SnapshotCard[],
  cardId: number,
  zone: Zone,
  category: string | null,
  printingId: number | null,
  isFoil: boolean,
): SnapshotCard | undefined {
  return cards.find(
    (c) =>
      c.cardId === cardId &&
      c.zone === zone &&
      c.category === category &&
      (c.printingId ?? null) === printingId &&
      c.isFoil === isFoil,
  );
}

function applyAdd(
  cards: SnapshotCard[],
  before: DeckSnapshot,
  change: Extract<PlannedChange, { op: "add" }>,
): void {
  const existing = findAddTarget(
    cards,
    change.cardId,
    change.zone,
    change.category,
    change.printingId ?? null,
    change.isFoil ?? false,
  );
  if (existing) {
    existing.quantity += change.quantity;
    return;
  }
  const meta = before.cardMeta.get(change.cardId);
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
    isNew: true,
  });
}

function applyRemove(
  cards: SnapshotCard[],
  change: Extract<PlannedChange, { op: "remove" }>,
): void {
  const idx = cards.findIndex((c) => c.id === change.deckCardId);
  if (idx !== -1) cards.splice(idx, 1);
}

function applyUpdate(
  cards: SnapshotCard[],
  change: Extract<PlannedChange, { op: "update" }>,
): void {
  const row = cards.find((c) => c.id === change.deckCardId);
  if (!row) return;
  if (change.quantity <= 0) {
    cards.splice(cards.indexOf(row), 1);
  } else {
    row.quantity = change.quantity;
  }
}

function applyMove(
  cards: SnapshotCard[],
  change: Extract<PlannedChange, { op: "move" }>,
): void {
  const row = cards.find((c) => c.id === change.deckCardId);
  if (!row) return;
  const target = findRow(cards, row.cardId, change.zone, change.category);
  if (target && target.id !== row.id) {
    target.quantity += row.quantity;
    cards.splice(cards.indexOf(row), 1);
  } else {
    row.zone = change.zone;
    row.category = change.category;
  }
}

export function projectChanges(
  before: DeckSnapshot,
  changes: readonly PlannedChange[],
): DeckSnapshot {
  const cards: SnapshotCard[] = before.cards.map((c) => ({ ...c }));
  for (const change of changes) {
    switch (change.op) {
      case "add":
        applyAdd(cards, before, change);
        break;
      case "remove":
        applyRemove(cards, change);
        break;
      case "update":
        applyUpdate(cards, change);
        break;
      case "move":
        applyMove(cards, change);
        break;
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
        issues.push({ kind: "category_zone_mismatch" });
      }
    }
  }
  return issues;
}
