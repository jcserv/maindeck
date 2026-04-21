"use server";

import { requireDeckOwner } from "@/lib/auth/deck-access";
import { prisma } from "@/lib/db";
import { parseImportText } from "@/lib/deck-io/parse";
import { resolveCards } from "@/lib/deck-io/resolve";
import { bulkUpdateDeck } from "@/lib/deck/editor-actions";
import { diffDeck, type ExistingDeckCard } from "@/lib/deck/bulk-edit-diff";

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
  await requireDeckOwner(deckId);

  const parseResult = parseImportText(text);
  const { resolved, unmatched } = await resolveCards(parseResult.cards);

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

  const changes = diffDeck(resolved, existing);

  if (changes.length > 0) {
    await bulkUpdateDeck(deckId, changes);
  }

  let added = 0;
  let removed = 0;
  let updated = 0;
  for (const c of changes) {
    if (c.op === "add") added++;
    else if (c.op === "remove") removed++;
    else if (c.op === "update") updated++;
  }

  const warnings = [...parseResult.warnings];
  if (parseResult.unmatchedLines.length > 0) {
    warnings.push(
      `${parseResult.unmatchedLines.length} line(s) could not be parsed as card entries`,
    );
  }

  return {
    added,
    removed,
    updated,
    unmatchedNames: unmatched.map((u) => u.name),
    warnings,
  };
}
