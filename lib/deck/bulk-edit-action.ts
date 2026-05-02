"use server";

import { intakeDecklist } from "@/lib/deck-io/intake";
import { runOwnerDeckMutation } from "@/lib/deck/mutation";

export type BulkReplaceResult = {
  added: number;
  removed: number;
  updated: number;
  unmatchedNames: string[];
  warnings: string[];
};

export const bulkReplaceDeck = runOwnerDeckMutation(
  "deck.bulkReplace",
  "none",
  async ({ deckId, userId }, text: string): Promise<BulkReplaceResult> => {
    const result = await intakeDecklist({
      deckId,
      userId,
      text,
      mode: "replace",
    });
    return {
      added: result.added,
      removed: result.removed,
      updated: result.updated,
      unmatchedNames: result.unmatchedNames,
      warnings: result.warnings,
    };
  },
);
