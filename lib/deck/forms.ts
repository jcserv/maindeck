import { z } from "zod";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import {
  DECK_NAME_MAX,
  DECK_DESCRIPTION_MAX,
  CATEGORY_NAME_MAX,
  IMPORT_TEXT_MAX,
} from "@/lib/deck/constants";

// Constants kept deliberately generous but bounded — they exist to stop
// pathologically large payloads from reaching Prisma, not to enforce UX rules.
// Re-exported so existing server-side imports of these constants from this
// module keep working. Client components should import from
// "@/lib/deck/constants" directly to avoid pulling in zod.
export {
  DECK_NAME_MAX,
  DECK_DESCRIPTION_MAX,
  CATEGORY_NAME_MAX,
  IMPORT_TEXT_MAX,
};

const FormatEnum = z.enum(Format);
const VisibilityEnum = z.enum(Visibility);

const trimmedString = (max: number) =>
  z.string().trim().max(max);

const nullableDescription = z
  .string()
  .trim()
  .max(DECK_DESCRIPTION_MAX)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .catch(null);

export const createDeckSchema = z.object({
  name: trimmedString(DECK_NAME_MAX)
    .transform((v) => (v.length === 0 ? "Untitled Deck" : v)),
  format: FormatEnum.catch(Format.COMMANDER),
  description: nullableDescription,
  visibility: VisibilityEnum.catch(Visibility.PRIVATE),
});
export type CreateDeckInput = z.infer<typeof createDeckSchema>;

export const updateDeckSchema = z.object({
  name: trimmedString(DECK_NAME_MAX).min(1).optional(),
  format: FormatEnum.catch(Format.COMMANDER),
  description: nullableDescription,
  visibility: VisibilityEnum.catch(Visibility.PRIVATE),
});
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;

export const deckNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(DECK_NAME_MAX);

export const deckDescriptionSchema = z
  .string()
  .max(DECK_DESCRIPTION_MAX)
  .transform((v) => v.trim());

export const deckBracketSchema = z.number().int().min(1).max(5).nullable();

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Category name cannot be empty")
  .max(CATEGORY_NAME_MAX);

export const reorderCategoriesSchema = z
  .array(trimmedString(CATEGORY_NAME_MAX).min(1))
  .max(200);

export const categoryDeleteModeSchema = z.enum(["uncategorize", "deleteCards"]);
export type { CategoryDeleteMode } from "@/lib/deck/constants";

export const importTextSchema = z.string().max(IMPORT_TEXT_MAX);

export const createDeckWithImportSchema = z.object({
  name: trimmedString(DECK_NAME_MAX).min(1),
  format: FormatEnum.optional(),
  visibility: VisibilityEnum.optional(),
  description: trimmedString(DECK_DESCRIPTION_MAX).optional(),
  importText: importTextSchema,
});
export type CreateDeckWithImportInput = z.infer<
  typeof createDeckWithImportSchema
>;

/**
 * FormData is the natural input for most Server Actions. Pulls the named
 * keys into a plain object and hands them to the schema — the schema owns
 * trimming, enum fallback, and length limits.
 */
export function parseDeckForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
  fields: readonly (keyof z.input<T> & string)[],
): z.output<T> {
  const input: Record<string, unknown> = {};
  for (const key of fields) {
    const value = formData.get(key);
    if (value !== null) input[key] = value;
  }
  return schema.parse(input);
}
