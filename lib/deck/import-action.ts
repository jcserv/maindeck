"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { requireDeckOwner } from "@/lib/auth/deck-access";
import {
  matchedResolved,
  parseAndResolve,
  toAddChanges,
} from "@/lib/deck-io/resolved-decklist";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import { withActionLogging } from "@/lib/telemetry";
import { applyChanges, InvariantViolation } from "@/lib/deck/mutation";
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

export const importDeck = withActionLogging(
  "deck.import",
  async (deckId: string, input: string): Promise<ImportResult> => {
    const { userId } = await requireDeckOwner(deckId);
    input = importTextSchema.parse(input);

    const resolved = await parseAndResolve(input);
    const matched = matchedResolved(resolved);
    const warnings = [...resolved.warnings];

    let added = matched.length;
    if (matched.length > 0) {
      try {
        await applyChanges(deckId, userId, toAddChanges(resolved));
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
      unmatchedCount: resolved.resolution.unmatched.length,
      unmatchedNames: resolved.resolution.unmatched.map((c) => c.name),
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

    try {
      const resolved = await parseAndResolve(parsed.importText);
      const matched = matchedResolved(resolved);

      if (matched.length > 0) {
        try {
          await applyChanges(deck.id, session.userId, toAddChanges(resolved), {
            skipRevision: true,
          });
        } catch (err) {
          if (!(err instanceof InvariantViolation)) throw err;
        }
      }
    } catch (err) {
      await prisma.deck.delete({ where: { id: deck.id } }).catch(() => {});
      throw err;
    }

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deck.id}`);

    return deck.id;
  },
);
