import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ensureDeckCategories } from "@/lib/deck/category-registry";
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
      categories: r.parsed.categories,
      printingId: r.printingId,
      isFoil: r.isFoil,
    }));
}

/**
 * Register any imported category names missing from the deck's registry, so
 * a JSON round-trip is lossless. Names are normalized to the registry
 * convention (trimmed, lowercased). When the source carried its registry
 * (JSON exports), missing rows are created in the export's sortOrder order —
 * including empty categories — appended after the deck's existing entries;
 * otherwise membership names are created alphabetically.
 */
async function ensureCategories(
  tx: Prisma.TransactionClient,
  deckId: string,
  changes: readonly PlannedChange[],
  registry?: readonly { name: string; sortOrder: number }[],
): Promise<void> {
  const names = new Set<string>();
  for (const c of changes) {
    if (c.op === "add" || c.op === "move" || c.op === "setCategories") {
      for (const name of c.categories) names.add(name);
    }
  }

  let ordered: string[];
  if (registry !== undefined) {
    const fromRegistry = [...registry]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => r.name);
    const carried = new Set(fromRegistry);
    ordered = [
      ...fromRegistry,
      ...[...names].filter((name) => !carried.has(name)).sort(),
    ];
  } else {
    ordered = [...names].sort();
  }

  await ensureDeckCategories(tx, deckId, ordered);
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
      quantity: true,
      categoryLinks: { take: 1, select: { deckCardId: true } },
    },
  });
  const existing: ExistingDeckCard[] = rows.map((e) => ({
    deckCardId: e.id,
    cardId: e.cardId,
    zone: e.zone,
    quantity: e.quantity,
    hasCategories: e.categoryLinks.length > 0,
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
    // Registry creation and the card writes commit or roll back together —
    // a batch that fails validation can't leave phantom categories behind.
    await prisma.$transaction(async (tx) => {
      await ensureCategories(tx, deckId, changes, parsed.categoryRegistry);
      await applyChanges(deckId, userId, changes, { ...applyOptions, tx });
    });
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
