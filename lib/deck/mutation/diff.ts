import type { ResolvedCard } from "@/lib/deck/io/resolve";
import { Zone } from "@/lib/generated/prisma/enums";
import type { PlannedChange } from "./types";

export type ExistingDeckCard = {
  deckCardId: string;
  cardId: number;
  zone: Zone;
  quantity: number;
  /**
   * Whether the row has category memberships. Optional because callers that
   * never merge duplicate rows (revert, proposals) don't load it; treated as
   * `false` when absent.
   */
  hasCategories?: boolean;
};

type DesiredEntry = { cardId: number; zone: Zone; quantity: number };

function keyOf(cardId: number, zone: Zone): string {
  return `${cardId}|${zone}`;
}

function buildDesired(
  resolved: readonly ResolvedCard[],
): Map<string, DesiredEntry> {
  const map = new Map<string, DesiredEntry>();
  for (const r of resolved) {
    if (r.cardId === null) continue;
    const { zone, quantity } = r.parsed;
    const key = keyOf(r.cardId, zone);
    const prior = map.get(key);
    if (prior) {
      prior.quantity += quantity;
    } else {
      map.set(key, { cardId: r.cardId, zone, quantity });
    }
  }
  return map;
}

function buildExisting(
  existing: readonly ExistingDeckCard[],
): Map<string, { primary: ExistingDeckCard; extras: ExistingDeckCard[] }> {
  const buckets = new Map<string, ExistingDeckCard[]>();
  for (const e of existing) {
    const key = keyOf(e.cardId, e.zone);
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }

  const map = new Map<
    string,
    { primary: ExistingDeckCard; extras: ExistingDeckCard[] }
  >();
  for (const [key, list] of buckets) {
    // Categorized rows win the keeper slot so a replace-import that collapses
    // duplicate rows never deletes the one carrying memberships.
    const sorted = [...list].sort(
      (a, b) =>
        Number(b.hasCategories ?? false) - Number(a.hasCategories ?? false) ||
        a.deckCardId.localeCompare(b.deckCardId),
    );
    const [primary, ...extras] = sorted;
    map.set(key, { primary: primary!, extras });
  }
  return map;
}

export function diffDeck(
  resolved: readonly ResolvedCard[],
  existing: readonly ExistingDeckCard[],
): PlannedChange[] {
  const desired = buildDesired(resolved);
  const existingMap = buildExisting(existing);
  const changes: PlannedChange[] = [];

  for (const [key, want] of desired) {
    const have = existingMap.get(key);
    if (!have) {
      changes.push({
        op: "add",
        cardId: want.cardId,
        quantity: want.quantity,
        zone: want.zone,
        categories: [],
      });
      continue;
    }
    if (have.primary.quantity !== want.quantity) {
      changes.push({
        op: "update",
        deckCardId: have.primary.deckCardId,
        quantity: want.quantity,
      });
    }
    for (const extra of have.extras) {
      changes.push({ op: "remove", deckCardId: extra.deckCardId });
    }
  }

  for (const [key, have] of existingMap) {
    if (desired.has(key)) continue;
    changes.push({ op: "remove", deckCardId: have.primary.deckCardId });
    for (const extra of have.extras) {
      changes.push({ op: "remove", deckCardId: extra.deckCardId });
    }
  }

  return changes;
}
