"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { intakeDecklist } from "@/lib/deck/io/intake";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import { withActionLogging } from "@/lib/telemetry";
import { runOwnerDeckMutation } from "@/lib/deck/mutation";
import {
  deckMetaMutationTagsAll,
  invalidateTags,
} from "@/lib/deck/cache-tags";
import {
  createDeckWithImportSchema,
  importTextSchema,
  type CreateDeckWithImportInput,
} from "@/lib/deck/forms";

type ImportResult = {
  added: number;
  unmatchedCount: number;
  unmatchedNames: string[];
  warnings: string[];
};

export const importDeck = runOwnerDeckMutation(
  "deck.import",
  "none",
  async ({ deckId, userId }, input: string): Promise<ImportResult> => {
    const text = importTextSchema.parse(input);

    const result = await intakeDecklist({
      deckId,
      userId,
      text,
      mode: "append",
    });

    return {
      added: result.added,
      unmatchedCount: result.unmatchedNames.length,
      unmatchedNames: result.unmatchedNames,
      warnings: result.warnings,
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
      await intakeDecklist({
        deckId: deck.id,
        userId: session.userId,
        text: parsed.importText,
        mode: "append",
        applyOptions: { skipRevision: true },
      });
    } catch (err) {
      await prisma.deck.delete({ where: { id: deck.id } }).catch(() => {});
      throw err;
    }

    invalidateTags(deckMetaMutationTagsAll({ deckId: deck.id }));

    return deck.id;
  },
);
