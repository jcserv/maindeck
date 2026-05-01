"use server";

import { requireDeckOwner } from "@/lib/auth/deck-access";
import { prisma } from "@/lib/db";
import { decklistAsReplace } from "@/lib/deck-io/intake";
import { detectFormat, parseDecklist } from "@/lib/deck-io/parse";
import { resolveDecklist } from "@/lib/deck-io/resolve";
import {
  applyChanges,
  InvariantViolation,
  type ExistingDeckCard,
} from "@/lib/deck/mutation";

export type BulkReplaceResult = {
  added: number;
  removed: number;
  updated: number;
  unmatchedNames: string[];
  warnings: string[];
};

export async function bulkReplaceDeck(
  deckId: string,
  text: string,
): Promise<BulkReplaceResult> {
  const { userId } = await requireDeckOwner(deckId);

  const parsed = parseDecklist(text, detectFormat(text));
  const resolved = await resolveDecklist(parsed);
  const unmatched = resolved.unmatched;

  const rows = await prisma.deckCard.findMany({
    where: { deckId },
    select: {
      id: true,
      cardId: true,
      zone: true,
      category: true,
      quantity: true,
    },
  });

  const existing: ExistingDeckCard[] = rows.map((e) => ({
    deckCardId: e.id,
    cardId: e.cardId,
    zone: e.zone,
    category: e.category,
    quantity: e.quantity,
  }));

  const changes = decklistAsReplace(resolved, existing);
  const warnings = [...resolved.warnings];

  if (changes.length > 0) {
    try {
      await applyChanges(deckId, userId, changes);
    } catch (err) {
      if (err instanceof InvariantViolation) {
        warnings.push(...err.issues.map((i) => i.message));
        return {
          added: 0,
          removed: 0,
          updated: 0,
          unmatchedNames: unmatched.map((u) => u.name),
          warnings,
        };
      }
      throw err;
    }
  }

  let added = 0;
  let removed = 0;
  let updated = 0;
  for (const c of changes) {
    if (c.op === "add") added++;
    else if (c.op === "remove") removed++;
    else if (c.op === "update") updated++;
  }

  return {
    added,
    removed,
    updated,
    unmatchedNames: unmatched.map((u) => u.name),
    warnings,
  };
}
