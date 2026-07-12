import { z } from "zod";
import { Zone } from "@/lib/generated/prisma/enums";
import type { ParsedCard, ParsedDecklist } from "../parse";
import { MAX_CARD_QTY } from "../consts";
import type { DecklistParser } from "./types";

const jsonCardBase = {
  name: z.string(),
  quantity: z.number().int().positive().max(MAX_CARD_QTY),
  zone: z.nativeEnum(Zone),
  set: z.string().optional(),
  collectorNumber: z.string().optional(),
  isFoil: z.boolean(),
  printingId: z.number().int().optional(),
};

const modernJsonCardSchema = z.object({
  ...jsonCardBase,
  /** Ordered category memberships; `[0]` is the primary. */
  categories: z.array(z.string()),
});

/** Pre-multi-category exports carried a single nullable `category`. */
const legacyJsonCardSchema = z
  .object({ ...jsonCardBase, category: z.string().nullable() })
  .transform(({ category, ...rest }) => ({
    ...rest,
    categories: category === null ? [] : [category],
  }));

const JsonCardSchema = z.union([modernJsonCardSchema, legacyJsonCardSchema]);

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
      // safeParse failure always carries at least one issue.
      `JSON decklist failed validation: ${result.error.issues[0]!.message}`,
    );
    return { format: "json", cards: [], unmatchedLines: [], warnings };
  }

  const cards: ParsedCard[] = result.data.cards.map((c) => {
    // Normalize to the registry convention and dedupe, preserving order.
    const categories: string[] = [];
    for (const raw of c.categories) {
      const name = raw.trim().toLowerCase();
      if (name.length > 0 && !categories.includes(name)) {
        categories.push(name);
      }
    }
    return {
      name: c.name,
      quantity: c.quantity,
      zone: c.zone,
      categories,
      ...(c.set !== undefined && { set: c.set }),
      ...(c.collectorNumber !== undefined && {
        collectorNumber: c.collectorNumber,
      }),
      isFoil: c.isFoil,
    };
  });

  return { format: "json", cards, unmatchedLines: [], warnings };
}

export const jsonAdapter: DecklistParser = {
  id: "json",
  detect,
  parse,
};
