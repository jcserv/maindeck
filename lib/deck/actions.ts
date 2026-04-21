"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { requireDeckOwner } from "@/lib/auth/deck-access";
import { invalidateDeck } from "@/lib/deck/invalidation";
import { invalidate } from "@/lib/cache";
import { withActionLogging } from "@/lib/telemetry";
import { Visibility } from "@/lib/generated/prisma/enums";
import { z } from "zod";
import {
  createDeckSchema,
  deckBracketSchema,
  deckDescriptionSchema,
  deckNameSchema,
  parseDeckForm,
  updateDeckSchema,
} from "@/lib/validation/deck";

const visibilitySchema = z.enum(
  Object.values(Visibility) as [Visibility, ...Visibility[]],
);

export const createDeck = withActionLogging(
  "deck.create",
  async (formData: FormData): Promise<string> => {
    const session = await requireSession();
    const input = parseDeckForm(createDeckSchema, formData, [
      "name",
      "format",
      "description",
      "visibility",
    ]);

    const deck = await prisma.deck.create({
      data: {
        userId: session.userId,
        name: input.name,
        format: input.format,
        description: input.description,
        visibility: input.visibility,
      },
    });

    updateTag("deck-list");
    updateTag("decks:public");
    await invalidate(
      `decks:user:${session.userId}:minimal`,
      `decks:user:${session.userId}:strip`,
      `decks:user:${session.userId}:preview`,
    );
    return deck.id;
  },
);

export const updateDeck = withActionLogging(
  "deck.update",
  async (deckId: string, formData: FormData): Promise<void> => {
    const { userId } = await requireDeckOwner(deckId);
    const input = parseDeckForm(updateDeckSchema, formData, [
      "name",
      "format",
      "description",
      "visibility",
    ]);

    await prisma.deck.update({
      where: { id: deckId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        format: input.format,
        description: input.description,
        visibility: input.visibility,
      },
    });

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deckId}`);
    await invalidateDeck(deckId, userId);
  },
);

export const updateDeckName = withActionLogging(
  "deck.updateName",
  async (deckId: string, name: string): Promise<void> => {
    const { userId } = await requireDeckOwner(deckId);
    const parsed = deckNameSchema.parse(name);

    await prisma.deck.update({
      where: { id: deckId },
      data: { name: parsed },
    });

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deckId}`);
    await invalidateDeck(deckId, userId);
  },
);

export const updateDeckDescription = withActionLogging(
  "deck.updateDescription",
  async (deckId: string, description: string): Promise<void> => {
    const { userId } = await requireDeckOwner(deckId);
    const trimmed = deckDescriptionSchema.parse(description);

    await prisma.deck.update({
      where: { id: deckId },
      data: { description: trimmed || null },
    });

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deckId}`);
    await invalidateDeck(deckId, userId);
  },
);

export const updateDeckVisibility = withActionLogging(
  "deck.updateVisibility",
  async (deckId: string, visibility: Visibility): Promise<void> => {
    const { userId } = await requireDeckOwner(deckId);
    const parsed = visibilitySchema.parse(visibility);

    await prisma.deck.update({
      where: { id: deckId },
      data: { visibility: parsed },
    });

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deckId}`);
    await invalidateDeck(deckId, userId);
  },
);

export const updateDeckManualBracket = withActionLogging(
  "deck.updateManualBracket",
  async (deckId: string, bracket: number | null): Promise<void> => {
    const { userId } = await requireDeckOwner(deckId);
    const parsed = deckBracketSchema.parse(bracket);

    await prisma.deck.update({
      where: { id: deckId },
      data: { manualBracket: parsed },
    });

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deckId}`);
    await invalidateDeck(deckId, userId);
  },
);

export const deleteDeck = withActionLogging(
  "deck.delete",
  async (deckId: string): Promise<void> => {
    const { userId } = await requireDeckOwner(deckId);

    await prisma.deck.delete({ where: { id: deckId } });

    updateTag("deck-list");
    updateTag("decks:public");
    updateTag(`deck:${deckId}`);
    await invalidateDeck(deckId, userId);

    redirect("/decks");
  },
);
