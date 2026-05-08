/**
 * Canonical place to ask "what image do we render for this card?"
 *
 * - `IMAGE_PRINTING_FRAGMENT` is the Prisma `select` for fetching the canonical
 *   first-printing image alongside any other printing fields callers need.
 * - `resolveCardImage` applies the fallback rule: a pinned Printing's image
 *   wins, otherwise the Card's first Printing.
 * - `resolveCardBackImage` mirrors that fallback for the back face of MDFC /
 *   transform / flip printings. Returns null for single-faced cards.
 */

export const IMAGE_PRINTING_FRAGMENT = {
  take: 1,
  orderBy: { id: "asc" },
  select: { imageUri: true, backImageUri: true },
} as const;

type ImagePrinting =
  | { imageUri: string | null; backImageUri?: string | null }
  | null
  | undefined;

type ImageCard = {
  printings: ReadonlyArray<{
    imageUri: string | null;
    backImageUri?: string | null;
  }>;
};

export function resolveCardImage(input: {
  printing: ImagePrinting;
  card: ImageCard;
}): string | null {
  return input.printing?.imageUri ?? input.card.printings[0]?.imageUri ?? null;
}

export function resolveCardBackImage(input: {
  printing: ImagePrinting;
  card: ImageCard;
}): string | null {
  return (
    input.printing?.backImageUri ??
    input.card.printings[0]?.backImageUri ??
    null
  );
}
