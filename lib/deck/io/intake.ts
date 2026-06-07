import "server-only";

import { prisma } from "@/lib/db";
import {
  applyChanges,
  diffDeck,
  InvariantViolation,
  type ExistingDeckCard,
} from "@/lib/deck/mutation";
import { formatLegalityIssue } from "@/lib/deck/legality/shared";
import type { PlannedChange } from "@/lib/deck/mutation/types";
import { detectFormat, parseDecklist } from "./parse";
import { resolveDecklist, type ResolvedCard, type ResolvedDecklist } from "./resolve";
import { MAX_CARD_LINES } from "./consts";

type IntakeMode = "append" | "replace";

type IntakeInput = {
  deckId: string;
  userId: string;
  text: string;
  mode: IntakeMode;
  /** Forwarded to `applyChanges`; used by `createDeckWithImport` to skip the initial revision row, and by bulk-ingest workflows to skip per-deck cache invalidation. */
  applyOptions?: { skipRevision?: boolean; skipCacheInvalidation?: boolean };
};

type IntakeResult = {
  /** Total ops applied (sum of added + removed + updated). */
  applied: number;
  added: number;
  removed: number;
  updated: number;
  unmatchedNames: string[];
  warnings: string[];
};

function asAdds(resolved: ResolvedDecklist): PlannedChange[] {
  return resolved.cards
    .filter((r): r is ResolvedCard & { cardId: number } => r.cardId !== null)
    .map((r) => ({
      op: "add",
      cardId: r.cardId,
      quantity: r.parsed.quantity,
      zone: r.parsed.zone,
      category: r.parsed.category,
      printingId: r.printingId,
      isFoil: r.isFoil,
    }));
}

async function buildReplaceChanges(
  deckId: string,
  resolved: ResolvedDecklist,
): Promise<PlannedChange[]> {
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
  return diffDeck(resolved.cards, existing);
}

function tally(changes: readonly PlannedChange[]): {
  added: number;
  removed: number;
  updated: number;
} {
  let added = 0;
  let removed = 0;
  let updated = 0;
  for (const c of changes) {
    switch (c.op) {
      case "add":
        added++;
        break;
      case "remove":
        removed++;
        break;
      case "update":
        updated++;
        break;
      /* c8 ignore next 3 */
      case "move":
        break;
    }
  }
  return { added, removed, updated };
}

export async function intakeDecklist(input: IntakeInput): Promise<IntakeResult> {
  const { deckId, userId, text, mode, applyOptions } = input;

  const rawParsed = parseDecklist(text, detectFormat(text));
  let parsed = rawParsed;
  if (rawParsed.cards.length > MAX_CARD_LINES) {
    parsed = {
      ...rawParsed,
      cards: rawParsed.cards.slice(0, MAX_CARD_LINES),
      warnings: [...rawParsed.warnings, `import truncated to ${MAX_CARD_LINES} lines`],
    };
  }
  const resolved = await resolveDecklist(parsed);
  const warnings = [...resolved.warnings];
  const unmatchedNames = resolved.unmatched.map((c) => c.name);

  const changes =
    mode === "append" ? asAdds(resolved) : await buildReplaceChanges(deckId, resolved);

  /* c8 ignore next 3 -- v8 doesn't instrument the implicit-else of an
     if-without-else; the false path is exercised by every non-empty test. */
  if (changes.length === 0) {
    return { applied: 0, added: 0, removed: 0, updated: 0, unmatchedNames, warnings };
  }

  try {
    await applyChanges(deckId, userId, changes, applyOptions);
  } catch (err) {
    // InvariantViolation = legality/structural issues; surface as warnings, drop the batch.
    if (err instanceof InvariantViolation) {
      warnings.push(...err.issues.map(formatLegalityIssue));
      return { applied: 0, added: 0, removed: 0, updated: 0, unmatchedNames, warnings };
    }
    throw err;
  }

  const counts = tally(changes);
  return {
    applied: counts.added + counts.removed + counts.updated,
    ...counts,
    unmatchedNames,
    warnings,
  };
}
