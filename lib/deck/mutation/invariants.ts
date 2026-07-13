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

/**
 * Category memberships are not part of a DeckCard's identity — a merge target
 * is matched purely on (cardId, zone, printingId, isFoil).
 */
function findMergeTarget(
  cards: SnapshotCard[],
  cardId: number,
  zone: Zone,
  printingId: number | null,
  isFoil: boolean,
): SnapshotCard | undefined {
  return cards.find(
    (c) =>
      c.cardId === cardId &&
      c.zone === zone &&
      (c.printingId ?? null) === printingId &&
      c.isFoil === isFoil,
  );
}

function applyAdd(
  cards: SnapshotCard[],
  before: DeckSnapshot,
  change: Extract<PlannedChange, { op: "add" }>,
): void {
  const existing = findMergeTarget(
    cards,
    change.cardId,
    change.zone,
    change.printingId ?? null,
    change.isFoil ?? false,
  );
  if (existing) {
    existing.quantity += change.quantity;
    // A categorized add restates the row's memberships; a plain add (no
    // categories picked) leaves the existing categorization alone.
    if (change.categories.length > 0) {
      existing.categories = [...change.categories];
    }
    return;
  }
  const meta = before.cardMeta.get(change.cardId);
  cards.push({
    id: makeDeckCardId(),
    cardId: change.cardId,
    cardName: meta?.name ?? `card:${change.cardId}`,
    zone: change.zone,
    categories: [...change.categories],
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

function applySetCategories(
  cards: SnapshotCard[],
  change: Extract<PlannedChange, { op: "setCategories" }>,
): void {
  const row = cards.find(
    (c) => c.cardId === change.cardId && c.zone === change.zone,
  );
  if (!row) return;
  row.categories = [...change.categories];
}

function applyMove(
  cards: SnapshotCard[],
  change: Extract<PlannedChange, { op: "move" }>,
): void {
  const row = cards.find((c) => c.id === change.deckCardId);
  if (!row) return;
  const target = findMergeTarget(
    cards.filter((c) => c.id !== row.id),
    row.cardId,
    change.zone,
    row.printingId ?? null,
    row.isFoil,
  );
  if (target) {
    target.quantity += row.quantity;
    // Mirror applyAdd: a plain move (no categories picked) leaves the merge
    // target's categorization alone; a categorized move promote-merges — the
    // move's memberships lead, the target's extras follow.
    if (change.categories.length > 0) {
      target.categories = [
        ...change.categories,
        ...target.categories.filter((n) => !change.categories.includes(n)),
      ];
    }
    cards.splice(cards.indexOf(row), 1);
  } else {
    row.zone = change.zone;
    row.categories = [...change.categories];
  }
}

export function projectChanges(
  before: DeckSnapshot,
  changes: readonly PlannedChange[],
): DeckSnapshot {
  const cards: SnapshotCard[] = before.cards.map((c) => ({
    ...c,
    categories: [...c.categories],
  }));
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
      case "setCategories":
        applySetCategories(cards, change);
        break;
    }
  }
  return { ...before, cards };
}

export function checkStructural(
  changes: readonly PlannedChange[],
  categoryNames: readonly string[],
): LegalityIssue[] {
  const known = new Set(categoryNames);
  const issues: LegalityIssue[] = [];
  for (const change of changes) {
    if (
      change.op === "add" ||
      change.op === "move" ||
      change.op === "setCategories"
    ) {
      if (change.categories.length > 0 && change.zone !== Zone.MAINBOARD) {
        issues.push({ kind: "category_zone_mismatch" });
      }
      const seen = new Set<string>();
      for (const name of change.categories) {
        if (!known.has(name)) {
          issues.push({ kind: "unknown_category", category: name });
        }
        if (seen.has(name)) {
          issues.push({ kind: "duplicate_category", category: name });
        }
        seen.add(name);
      }
    }
  }
  return issues;
}
