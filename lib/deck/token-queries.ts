import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { Zone } from "@/lib/generated/prisma/client";

const EXCLUDED_ZONES: Zone[] = ["SIDEBOARD", "CONSIDERING"];

/**
 * Scryfall serves card images from a stable CDN path keyed by the card's UUID:
 * `{size}/{face}/{id[0]}/{id[1]}/{id}.jpg`. Tokens aren't in our Printing table,
 * so we reconstruct the URL instead of storing it. Safe because tokenScryfallId
 * is always a lowercase-hex UUID from Scryfall's `all_parts` payload.
 */
function tokenImageUri(scryfallId: string): string {
  return `https://cards.scryfall.io/normal/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

export async function getTokensForDeck(deckId: string): Promise<
  Array<{
    tokenName: string;
    tokenScryfallId: string;
    tokenImageUri: string;
    producedBy: string[];
  }>
> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`deck-tokens:${deckId}`);

  const deckCards = await prisma.deckCard.findMany({
    where: {
      deckId,
      zone: { notIn: EXCLUDED_ZONES },
    },
    select: {
      card: {
        select: {
          name: true,
          tokens: {
            select: {
              tokenName: true,
              tokenScryfallId: true,
            },
          },
        },
      },
    },
  });

  // Aggregate by tokenName: Scryfall stores one CardToken row per printing of
  // the same token, so keying by tokenScryfallId would produce duplicate rows
  // for tokens reprinted across sets (e.g. Servo, Treasure).
  const tokenMap = new Map<
    string,
    { tokenScryfallId: string; producedBy: Set<string> }
  >();

  for (const dc of deckCards) {
    for (const token of dc.card.tokens) {
      const existing = tokenMap.get(token.tokenName);
      if (existing) {
        existing.producedBy.add(dc.card.name);
      } else {
        tokenMap.set(token.tokenName, {
          tokenScryfallId: token.tokenScryfallId,
          producedBy: new Set([dc.card.name]),
        });
      }
    }
  }

  return Array.from(tokenMap.entries()).map(([tokenName, data]) => ({
    tokenName,
    tokenScryfallId: data.tokenScryfallId,
    tokenImageUri: tokenImageUri(data.tokenScryfallId),
    producedBy: Array.from(data.producedBy).sort(),
  }));
}
