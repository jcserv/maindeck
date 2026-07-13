// Plain constants and types shared between server validation and client UI.
// Kept zod-free so client components can import these without dragging the
// zod runtime (and its locale data) into the browser bundle.

export const DECK_NAME_MAX = 100;
export const DECK_DESCRIPTION_MAX = 2000;
export const CATEGORY_NAME_MAX = 50;
export const IMPORT_TEXT_MAX = 100_000;

export type CategoryDeleteMode = "uncategorize" | "deleteCards";

/**
 * Canonical category-name normalization applied at every write boundary.
 * Registry rows are stored in this form, so membership names must be
 * normalized before comparison or persistence.
 */
export const normalizeCategory = (name: string): string =>
  name.trim().toLowerCase();
