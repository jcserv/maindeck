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
  await requireDeckOwner(deckId);
  input = importTextSchema.parse(input);

  const parseResult = parseImportText(input);
  const resolveResult = await resolveCards(parseResult.cards);

  const matched = resolveResult.resolved.filter((r) => r.cardId !== null);

  await prisma.$transaction(async (tx) => {
    for (const r of matched) {
      const cardId = r.cardId!;
      const { zone, category, quantity } = r.parsed;
      const { printingId, isFoil } = r;
      const existing = await tx.deckCard.findFirst({
        where: { deckId, cardId, zone, category, printingId, isFoil },
        select: { id: true },
      });
      if (existing) {
        await tx.deckCard.update({
          where: { id: existing.id },
          data: { quantity: { increment: quantity } },
        });
      } else {
        await tx.deckCard.create({
          data: { deckId, cardId, quantity, zone, category, printingId, isFoil },
        });
      }
    }
  });

  updateTag(`deck:${deckId}`);

  return {
    added: matched.length,
    unmatchedCount: resolveResult.unmatched.length,
    unmatchedNames: resolveResult.unmatched.map((c) => c.name),
    warnings: [
      ...parseResult.warnings,
      ...resolveResult.warnings,
      ...(parseResult.unmatchedLines.length > 0
        ? [
            `${parseResult.unmatchedLines.length} line(s) could not be parsed as card entries`,
          ]
        : []),
    ],
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

  await prisma.$transaction(async (tx) => {
    for (const r of matched) {
      const cardId = r.cardId!;
      const { zone, category, quantity } = r.parsed;
      const { printingId, isFoil } = r;
      const existing = await tx.deckCard.findFirst({
        where: { deckId: deck.id, cardId, zone, category, printingId, isFoil },
        select: { id: true },
      });
      if (existing) {
        await tx.deckCard.update({
          where: { id: existing.id },
          data: { quantity: { increment: quantity } },
        });
      } else {
        await tx.deckCard.create({
          data: {
            deckId: deck.id,
            cardId,
            quantity,
            zone,
            category,
            printingId,
            isFoil,
          },
        });
      }
    }
  });

  updateTag("deck-list");
  updateTag("decks:public");
  updateTag(`deck:${deck.id}`);

  return deck.id;
  },
);
