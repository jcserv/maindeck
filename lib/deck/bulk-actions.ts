import type { Zone } from "@/lib/generated/prisma/enums";
import type { PlannedChange } from "@/lib/deck/mutation/types";
import type { ZoneAction } from "@/lib/deck/zone-view";

export type BulkSelectionTarget = { deckCardId: string; viaCategory?: string };

export type BulkCardAction =
  | { kind: "remove" }
  | { kind: "moveZone"; zone: Zone }
  | { kind: "setPrimaryCategory"; category: string | null }
  | { kind: "addCategory"; category: string }
  | { kind: "removeCategory"; category: string };

export type BulkCardState = { id: string; zone: Zone; categories: string[] };

type MoveChange = Extract<PlannedChange, { op: "move" }>;
type BulkPlannedChange = Extract<PlannedChange, { op: "move" | "remove" }>;

function sameCategories(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

function moveIfChanged(
  card: BulkCardState,
  zone: Zone,
  categories: string[],
): MoveChange | null {
  if (card.zone === zone && sameCategories(card.categories, categories)) {
    return null;
  }
  return { op: "move", deckCardId: card.id, zone, categories };
}

function mainboardCategories(card: BulkCardState): string[] {
  return card.zone === "MAINBOARD" ? card.categories : [];
}

function planRemove(
  card: BulkCardState,
  viaCategories: (string | undefined)[],
): BulkPlannedChange | null {
  if (viaCategories.includes(undefined)) {
    return { op: "remove", deckCardId: card.id };
  }
  const stripped = new Set(viaCategories);
  return moveIfChanged(
    card,
    card.zone,
    card.categories.filter((name) => !stripped.has(name)),
  );
}

function planMembershipChange(
  card: BulkCardState,
  action: Exclude<BulkCardAction, { kind: "remove" }>,
  knownCategories: ReadonlySet<string>,
): MoveChange | null {
  const current = mainboardCategories(card);
  switch (action.kind) {
    case "moveZone":
      return card.zone === action.zone
        ? null
        : moveIfChanged(card, action.zone, []);
    case "setPrimaryCategory": {
      const { category } = action;
      if (category === null) return moveIfChanged(card, "MAINBOARD", []);
      if (!knownCategories.has(category)) return null;
      return moveIfChanged(card, "MAINBOARD", [
        category,
        ...current.filter((name) => name !== category),
      ]);
    }
    case "addCategory":
      if (!knownCategories.has(action.category)) return null;
      if (current.includes(action.category)) return null;
      return moveIfChanged(card, "MAINBOARD", [...current, action.category]);
    case "removeCategory":
      if (card.zone !== "MAINBOARD") return null;
      return moveIfChanged(
        card,
        "MAINBOARD",
        current.filter((name) => name !== action.category),
      );
  }
}

export function planBulkCardAction(
  cards: readonly BulkCardState[],
  targets: readonly BulkSelectionTarget[],
  action: BulkCardAction,
  knownCategories: ReadonlySet<string>,
): BulkPlannedChange[] {
  const viaByCard = new Map<string, (string | undefined)[]>();
  for (const { deckCardId, viaCategory } of targets) {
    const list = viaByCard.get(deckCardId) ?? [];
    list.push(viaCategory);
    viaByCard.set(deckCardId, list);
  }

  const changes: BulkPlannedChange[] = [];
  for (const [deckCardId, viaCategories] of viaByCard) {
    const card = cards.find((c) => c.id === deckCardId);
    if (!card) continue;
    const change =
      action.kind === "remove"
        ? planRemove(card, viaCategories)
        : planMembershipChange(card, action, knownCategories);
    if (change) changes.push(change);
  }
  return changes;
}

export function toZoneAction(change: BulkPlannedChange): ZoneAction {
  if (change.op === "remove") {
    return { type: "remove", deckCardId: change.deckCardId };
  }
  return {
    type: "move",
    deckCardId: change.deckCardId,
    zone: change.zone,
    categories: change.categories,
  };
}
