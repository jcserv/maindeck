import { z } from "zod";
import { Zone } from "@/lib/generated/prisma/enums";
import { CATEGORY_NAME_MAX, normalizeCategory } from "@/lib/deck/constants";
import type { ParsedCard, ParsedDecklist } from "../parse";
import { MAX_CARD_QTY } from "../consts";
import type { DecklistParser } from "./types";

/** Generous per-card membership cap — bounds payloads, not UX. */
const MAX_CARD_CATEGORIES = 20;
/** Registry cap, matching `reorderCategoriesSchema`'s bound. */
const MAX_REGISTRY_CATEGORIES = 200;

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
  categories: z
    .array(z.string().max(CATEGORY_NAME_MAX))
    .max(MAX_CARD_CATEGORIES),
});

/** Pre-multi-category exports carried a single nullable `category`. */
const legacyJsonCardSchema = z
  .object({
    ...jsonCardBase,
    category: z.string().max(CATEGORY_NAME_MAX).nullable(),
  })
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
  categories: z
    .array(
      z.object({
        name: z.string().max(CATEGORY_NAME_MAX),
        sortOrder: z.number(),
      }),
    )
    .max(MAX_REGISTRY_CATEGORIES),
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
    let categories: string[] = [];
    for (const raw of c.categories) {
      const name = normalizeCategory(raw);
      if (name.length > 0 && !categories.includes(name)) {
        categories.push(name);
      }
    }
    // Categories are MAINBOARD-only; a hand-edited payload that puts them on
    // another zone loses just the memberships, not the whole import.
    if (categories.length > 0 && c.zone !== Zone.MAINBOARD) {
      warnings.push(
        `Ignored categories on "${c.name}": ${c.zone} cards can't have categories`,
      );
      categories = [];
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

  // Carry the export's registry through so a round-trip restores empty
  // categories and sortOrder, not just the memberships in use.
  const categoryRegistry: { name: string; sortOrder: number }[] = [];
  const seen = new Set<string>();
  for (const c of [...result.data.categories].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    const name = normalizeCategory(c.name);
    if (name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    categoryRegistry.push({ name, sortOrder: c.sortOrder });
  }

  return { format: "json", cards, unmatchedLines: [], warnings, categoryRegistry };
}

export const jsonAdapter: DecklistParser = {
  id: "json",
  detect,
  parse,
};
