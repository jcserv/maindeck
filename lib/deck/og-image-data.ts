/**
 * Pure helper that distills a `DeckById` into the shape an OG-image renderer
 * needs: a hero image (commander → highest-CMC mainboard creature → null
 * gradient fallback), the deck name, format, bracket, and owner username.
 *
 * Kept free of React / `ImageResponse` so it stays unit-testable; the route
 * file at `app/(ui)/deck/[id]/opengraph-image.tsx` is a thin wrapper.
 */

import { Format, Zone } from "@/lib/generated/prisma/enums";
import { resolveCardImage } from "@/lib/card/image";
import { resolveDeckBracket, getBracketInfo } from "@/lib/deck/brackets";
import type { Deck } from "@/lib/deck/zone-view";

interface DeckOgImageData {
  /** URL of the hero card image, or null if no creature is available. */
  heroImageUrl: string | null;
  title: string;
  format: Format;
  /** Resolved bracket name (e.g. "Core", "Optimized") for Commander; null otherwise. */
  bracket: string | null;
  /** Owner username without the `@` prefix. */
  username: string;
}

function isCreatureTypeLine(typeLine: string | null | undefined): boolean {
  return !!typeLine && /\bCreature\b/.test(typeLine);
}

function cmcOrZero(dc: { card: { cmc: number | null } }): number {
  return dc.card.cmc ?? 0;
}

/**
 * Pick the hero image for the OG card:
 * 1. Commander zone (highest quantity / first), if any
 * 2. Highest-CMC mainboard creature
 * 3. null (caller renders a gradient fallback)
 */
export function pickHeroImage(deck: Deck): string | null {
  const commander = deck.cards.find((dc) => dc.zone === Zone.COMMANDER);
  if (commander) {
    const img = resolveCardImage({
      printing: commander.printing,
      card: commander.card,
    });
    if (img) return img;
  }

  const creatures = deck.cards.filter(
    (dc) => dc.zone === Zone.MAINBOARD && isCreatureTypeLine(dc.card.typeLine),
  );
  if (creatures.length === 0) return null;

  const top = creatures.reduce((best, current) =>
    cmcOrZero(current) > cmcOrZero(best) ? current : best,
  );
  return resolveCardImage({ printing: top.printing, card: top.card });
}

export function buildDeckOgImageData(deck: Deck): DeckOgImageData {
  // `resolveDeckBracket` only returns a non-null result for COMMANDER decks,
  // and the bracket ids it produces (1–5) are always covered by `BRACKETS`.
  const resolved = resolveDeckBracket(deck);
  const bracket = resolved ? (getBracketInfo(resolved.bracket)?.name ?? null) : null;

  return {
    heroImageUrl: pickHeroImage(deck),
    title: deck.name,
    format: deck.format,
    bracket,
    username: deck.user.username,
  };
}
