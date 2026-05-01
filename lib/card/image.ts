/**
 * Canonical place to ask "what image do we render for this card?"
 *
 * - `IMAGE_PRINTING_FRAGMENT` is the Prisma `select` for fetching the canonical
 *   first-printing image alongside any other printing fields callers need.
 * - `resolveCardImage` applies the fallback rule: a pinned Printing's image
 *   wins, otherwise the Card's first Printing.
 */

export const IMAGE_PRINTING_FRAGMENT = {
  take: 1,
  orderBy: { id: "asc" },
  select: { imageUri: true },
} as const;

export type ImagePrinting = { imageUri: string | null } | null | undefined;

export type ImageCard = {
  printings: ReadonlyArray<{ imageUri: string | null }>;
};

export function resolveCardImage(input: {
  printing: ImagePrinting;
  card: ImageCard;
}): string | null {
  return input.printing?.imageUri ?? input.card.printings[0]?.imageUri ?? null;
}
