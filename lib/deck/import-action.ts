"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { requireDeckOwner } from "@/lib/auth/deck-access";
import { decklistAsAdds } from "@/lib/deck-io/intake";
import { detectFormat, parseDecklist } from "@/lib/deck-io/parse";
import { resolveDecklist } from "@/lib/deck-io/resolve";
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

    const parsed = parseDecklist(input, detectFormat(input));
    const resolved = await resolveDecklist(parsed);
    const changes = decklistAsAdds(resolved);
    const warnings = [...resolved.warnings];

    let added = changes.length;
    if (changes.length > 0) {
      try {
        await applyChanges(deckId, userId, changes);
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
      unmatchedCount: resolved.unmatched.length,
      unmatchedNames: resolved.unmatched.map((c) => c.name),
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
      const parsedDecklist = parseDecklist(
        parsed.importText,
        detectFormat(parsed.importText),
      );
      const resolved = await resolveDecklist(parsedDecklist);
      const changes = decklistAsAdds(resolved);

      if (changes.length > 0) {
        try {
          await applyChanges(deck.id, session.userId, changes, {
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
