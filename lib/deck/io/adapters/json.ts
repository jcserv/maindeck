import { z } from "zod";
import { Zone } from "@/lib/generated/prisma/enums";
import type { ParsedCard, ParsedDecklist } from "../parse";
import type { DecklistParser } from "./types";

const JsonCardSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  zone: z.nativeEnum(Zone),
  category: z.string().nullable(),
  set: z.string().optional(),
  collectorNumber: z.string().optional(),
  isFoil: z.boolean(),
  printingId: z.number().int().optional(),
});

export const MaindeckJsonSchema = z.object({
  name: z.string(),
  format: z.string(),
  visibility: z.string(),
  description: z.string().nullable(),
  cards: z.array(JsonCardSchema),
  categories: z.array(z.object({ name: z.string(), sortOrder: z.number() })),
});

export type MaindeckJson = z.infer<typeof MaindeckJsonSchema>;

function detect(input: string): number {
  return input.trimStart().startsWith("{") ? 1 : 0;
}

function parse(input: string): ParsedDecklist {
  const warnings: string[] = [];
  let raw: unknown;

  try {
    raw = JSON.parse(input);
  } catch {
    warnings.push("Decklist looks like JSON but could not be parsed");
    return { format: "json", cards: [], unmatchedLines: [], warnings };
  }

  const result = MaindeckJsonSchema.safeParse(raw);
  if (!result.success) {
    warnings.push(
      `JSON decklist failed validation: ${result.error.issues[0]?.message ?? "unknown error"}`,
    );
    return { format: "json", cards: [], unmatchedLines: [], warnings };
  }

  const cards: ParsedCard[] = result.data.cards.map((c) => ({
    name: c.name,
    quantity: c.quantity,
    zone: c.zone,
    category: c.category,
    ...(c.set !== undefined && { set: c.set }),
    ...(c.collectorNumber !== undefined && { collectorNumber: c.collectorNumber }),
    isFoil: c.isFoil,
  }));

  return { format: "json", cards, unmatchedLines: [], warnings };
}

export const jsonAdapter: DecklistParser = {
  id: "json",
  detect,
  parse,
};
