import { prisma } from "@/lib/db";
import type { ParsedCard } from "./parse";

export type Match =
  | { kind: "exact" }
  | { kind: "fuzzy"; confidence: number }
  | { kind: "ambiguous"; candidates: { id: number; name: string }[] }
  | { kind: "none" };

export type CardResolution = {
  parsed: ParsedCard;
  cardId: number | null;
  matchedName: string | null;
  match: Match;
};

const FUZZY_PREFIX_LEN = 4;
const FUZZY_TAKE = 20;

/** Pick the candidate whose name length is closest to the target name. */
function pickClosest(
  target: string,
  candidates: ReadonlyArray<{ id: number; name: string }>,
): { id: number; name: string } | undefined {
  return [...candidates]
    .filter((c) =>
      c.name.toLowerCase().startsWith(target.slice(0, FUZZY_PREFIX_LEN)),
    )
    .sort(
      (a, b) =>
        Math.abs(a.name.length - target.length) -
        Math.abs(b.name.length - target.length),
    )[0];
}

function fuzzyConfidence(matchedName: string, target: string): number {
  const lenDelta = Math.abs(matchedName.length - target.length);
  const raw = 1 - lenDelta / Math.max(target.length, 1);
  return Math.max(0, Math.min(1, raw));
}

/**
 * Resolve parsed card names to canonical Card rows. Tries exact (case-insensitive)
 * first, then a length-delta fuzzy match per unmatched name.
 */
export async function resolveCardNames(
  parsed: readonly ParsedCard[],
): Promise<CardResolution[]> {
  const names = [...new Set(parsed.map((c) => c.name))];

  const exactMatches = await prisma.card.findMany({
    where: { name: { in: names, mode: "insensitive" } },
    select: { id: true, name: true },
  });

  const exactByLower = new Map<string, { id: number; name: string }>();
  for (const card of exactMatches) {
    exactByLower.set(card.name.toLowerCase(), card);
  }

  const unresolved = names.filter((n) => !exactByLower.has(n.toLowerCase()));

  const fuzzyByLower = new Map<string, { id: number; name: string }>();
  if (unresolved.length > 0) {
    const fuzzyResults = await Promise.all(
      unresolved.map((name) =>
        prisma.card.findMany({
          where: {
            name: {
              startsWith: name.slice(0, FUZZY_PREFIX_LEN),
              mode: "insensitive",
            },
          },
          select: { id: true, name: true },
          take: FUZZY_TAKE,
        }),
      ),
    );

    for (let i = 0; i < unresolved.length; i++) {
      const rawName = unresolved[i];
      const candidates = fuzzyResults[i];
      /* v8 ignore next */
      if (rawName === undefined || candidates === undefined) continue;
      const target = rawName.toLowerCase();
      const best = pickClosest(target, candidates);
      if (best) fuzzyByLower.set(target, best);
    }
  }

  return parsed.map((card) => {
    const lower = card.name.toLowerCase();
    const exact = exactByLower.get(lower);
    if (exact) {
      return {
        parsed: card,
        cardId: exact.id,
        matchedName: exact.name,
        match: { kind: "exact" },
      };
    }
    const fuzzy = fuzzyByLower.get(lower);
    if (fuzzy) {
      return {
        parsed: card,
        cardId: fuzzy.id,
        matchedName: fuzzy.name,
        match: { kind: "fuzzy", confidence: fuzzyConfidence(fuzzy.name, lower) },
      };
    }
    return {
      parsed: card,
      cardId: null,
      matchedName: null,
      match: { kind: "none" },
    };
  });
}
