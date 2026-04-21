import type { ResolvedCard } from "@/lib/deck-io/resolve";
import type { BulkChange } from "@/lib/deck/editor-actions";
import { Zone } from "@/lib/generated/prisma/enums";

export type ExistingDeckCard = {
  deckCardId: string;
  cardId: number;
  zone: Zone;
  category: string | null;
  quantity: number;
};

type DesiredEntry = { cardId: number; zone: Zone; quantity: number };

function keyOf(cardId: number, zone: Zone): string {
  return `${cardId}|${zone}`;
}

function buildDesired(resolved: readonly ResolvedCard[]): Map<string, DesiredEntry> {
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
    // Prefer categorized rows over uncategorized so the "primary" survives an
    // unchanged-quantity case and its category is preserved.
    const sorted = [...list].sort((a, b) => {
      const aHasCat = a.category !== null ? 0 : 1;
      const bHasCat = b.category !== null ? 0 : 1;
      if (aHasCat !== bHasCat) return aHasCat - bHasCat;
      return (a.category ?? "").localeCompare(b.category ?? "");
    });
    const [primary, ...extras] = sorted;
    map.set(key, { primary: primary!, extras });
  }
  return map;
}

/**
 * Diff a resolved bulk-edit textarea against the current deck.
 *
 * Match key is `(cardId, zone)` — printing, isFoil, and subcategory are
 * preserved for any card that stays in the deck. Cross-zone moves drop the
 * existing row and create a new one (printing/foil are lost), matching import
 * semantics.
 */
export function diffDeck(
  resolved: readonly ResolvedCard[],
  existing: readonly ExistingDeckCard[],
): BulkChange[] {
  const desired = buildDesired(resolved);
  const existingMap = buildExisting(existing);
  const changes: BulkChange[] = [];

  for (const [key, want] of desired) {
    const have = existingMap.get(key);
    if (!have) {
      changes.push({
        op: "add",
        cardId: want.cardId,
        quantity: want.quantity,
        zone: want.zone,
        category: null,
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
