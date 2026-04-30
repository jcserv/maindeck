"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { requireDeckOwner } from "@/lib/auth/deck-access";
import { parseImportText } from "@/lib/deck-io/parse";
import { resolveCards } from "@/lib/deck-io/resolve";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import { withActionLogging } from "@/lib/telemetry";
import {
  applyChanges,
  InvariantViolation,
  type PlannedChange,
} from "@/lib/deck/mutation";
import {
  createDeckWithImportSchema,
  importTextSchema,
  type CreateDeckWithImportInput,
} from "@/lib/validation/deck";

export type ImportResult = {
  added: number;
  unmatchedCount: number;
  unmatchedNames: string[];
  warnings: string[];
};

function changesFromMatched(
  matched: Awaited<ReturnType<typeof resolveCards>>["resolved"],
): PlannedChange[] {
  return matched.map((r) => ({
    op: "add",
    cardId: r.cardId!,
    quantity: r.parsed.quantity,
    zone: r.parsed.zone,
    category: r.parsed.category,
    printingId: r.printingId,
    isFoil: r.isFoil,
  }));
}

export const importDeck = withActionLogging(
  "deck.import",
  async (deckId: string, input: string): Promise<ImportResult> => {
    const { userId } = await requireDeckOwner(deckId);
    input = importTextSchema.parse(input);

    const parseResult = parseImportText(input);
    const resolveResult = await resolveCards(parseResult.cards);
    const matched = resolveResult.resolved.filter((r) => r.cardId !== null);

    const warnings: string[] = [
      ...parseResult.warnings,
      ...resolveResult.warnings,
    ];
    if (parseResult.unmatchedLines.length > 0) {
      warnings.push(
        `${parseResult.unmatchedLines.length} line(s) could not be parsed as card entries`,
      );
    }

    let added = matched.length;
    if (matched.length > 0) {
      try {
        await applyChanges(deckId, userId, changesFromMatched(matched));
      } catch (err) {
        if (err instanceof InvariantViolation) {
          warnings.push(...err.issues.map((i) => i.message));
          added = 0;
        } else {
          throw err;
        }
      }
    }

    return {
      added,
      unmatchedCount: resolveResult.unmatched.length,
      unmatchedNames: resolveResult.unmatched.map((c) => c.name),
      warnings,
    };
  },
);

/**
 * Creates a new deck and bulk-adds cards parsed from `importText` in a single
 * server round-trip. Returns the new deck ID.
 */
export const createDeckWithImport = withActionLogging(
  "deck.createWithImport",
  async (input: CreateDeckWithImportInput): Promise<string> => {
    const session = await requireSession();
    const parsed = createDeckWithImportSchema.parse(input);

    const deck = await prisma.deck.create({
      data: {
        userId: session.userId,
        name: parsed.name,
        format: parsed.format ?? Format.COMMANDER,
        visibility: parsed.visibility ?? Visibility.PRIVATE,
        description: parsed.description ?? null,
      },
    });

    const parseResult = parseImportText(parsed.importText);
    const resolveResult = await resolveCards(parseResult.cards);
    const matched = resolveResult.resolved.filter((r) => r.cardId !== null);

    if (matched.length > 0) {
      try {
        await applyChanges(
          deck.id,
          session.userId,
          changesFromMatched(matched),
          { skipRevision: true },
        );
      } catch (err) {
        if (!(err instanceof InvariantViolation)) throw err;
      }
    }

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deck.id}`);

    return deck.id;
  },
);
