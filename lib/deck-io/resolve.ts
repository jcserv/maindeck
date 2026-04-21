import { prisma } from "@/lib/db";
import type { ParsedCard } from "./parse";

export type ResolvedCard = {
  parsed: ParsedCard;
  cardId: number | null;
  matchedName: string | null;
  fuzzy: boolean;
  printingId: number | null;
  isFoil: boolean;
};

export type ResolveResult = {
  resolved: ResolvedCard[];
  unmatched: ParsedCard[];
  warnings: string[];
};

export async function resolveCards(
  parsed: readonly ParsedCard[],
): Promise<ResolveResult> {
  const names = [...new Set(parsed.map((c) => c.name))];

  // Exact match (case-insensitive via Prisma mode: "insensitive")
  const exactMatches = await prisma.card.findMany({
    where: {
      name: { in: names, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });

  const exactByLower = new Map<string, { id: number; name: string }>();
  for (const card of exactMatches) {
    exactByLower.set(card.name.toLowerCase(), card);
  }

  // Find names that still need a fuzzy lookup
  const unresolved = names.filter((n) => !exactByLower.has(n.toLowerCase()));

  const fuzzyByLower = new Map<string, { id: number; name: string }>();

  if (unresolved.length > 0) {
    // Fetch prefix candidates for each unresolved name in parallel batches
    const fuzzyResults = await Promise.all(
      unresolved.map((name) =>
        prisma.card.findMany({
          where: { name: { startsWith: name.slice(0, 4), mode: "insensitive" } },
          select: { id: true, name: true },
          take: 20,
        }),
      ),
    );

    for (let i = 0; i < unresolved.length; i++) {
      const rawName = unresolved[i];
      const candidates = fuzzyResults[i];
      /* v8 ignore next */
      if (rawName === undefined || candidates === undefined) continue;
      const target = rawName.toLowerCase();

      // Pick the candidate whose name is closest in length to the target
      const best = candidates
        .filter((c) => c.name.toLowerCase().startsWith(target.slice(0, 4)))
        .sort(
          (a, b) =>
            Math.abs(a.name.length - target.length) -
            Math.abs(b.name.length - target.length),
        )[0];

      if (best) {
        fuzzyByLower.set(target, best);
      }
    }
  }

  type ResolvedRow = {
    parsed: ParsedCard;
    cardId: number | null;
    matchedName: string | null;
    fuzzy: boolean;
  };

  const rows: ResolvedRow[] = [];
  const unmatched: ParsedCard[] = [];

  for (const card of parsed) {
    const lower = card.name.toLowerCase();
    const exact = exactByLower.get(lower);

    if (exact) {
      rows.push({
        parsed: card,
        cardId: exact.id,
        matchedName: exact.name,
        fuzzy: false,
      });
      continue;
    }

    const fuzzy = fuzzyByLower.get(lower);
    if (fuzzy) {
      rows.push({
        parsed: card,
        cardId: fuzzy.id,
        matchedName: fuzzy.name,
        fuzzy: true,
      });
      continue;
    }

    rows.push({ parsed: card, cardId: null, matchedName: null, fuzzy: false });
    unmatched.push(card);
  }

  // Batch-fetch printings for rows that have a cardId AND set/collectorNumber.
  // Printing.setCode is stored lowercase (Scryfall); ParsedCard.set is uppercased.
  type PrintingRow = {
    id: number;
    cardId: number;
    setCode: string;
    collectorNumber: string;
    finishes: string[];
  };
  const printingByKey = new Map<string, PrintingRow>();

  const printingLookups = rows
    .filter(
      (r) =>
        r.cardId !== null &&
        r.parsed.set !== undefined &&
        r.parsed.collectorNumber !== undefined,
    )
    .map((r) => ({
      cardId: r.cardId!,
      setCode: r.parsed.set!.toLowerCase(),
      collectorNumber: r.parsed.collectorNumber!,
    }));

  if (printingLookups.length > 0) {
    const printings = (await prisma.printing.findMany({
      where: { OR: printingLookups },
      select: {
        id: true,
        cardId: true,
        setCode: true,
        collectorNumber: true,
        finishes: true,
      },
    })) as PrintingRow[];

    for (const p of printings) {
      const key = `${p.cardId}|${p.setCode.toLowerCase()}|${p.collectorNumber}`;
      printingByKey.set(key, p);
    }
  }

  const warnings: string[] = [];
  const resolved: ResolvedCard[] = rows.map((r) => {
    let printingId: number | null = null;
    let isFoil = r.parsed.isFoil;

    if (
      r.cardId !== null &&
      r.parsed.set !== undefined &&
      r.parsed.collectorNumber !== undefined
    ) {
      const key = `${r.cardId}|${r.parsed.set.toLowerCase()}|${r.parsed.collectorNumber}`;
      const printing = printingByKey.get(key);
      if (printing) {
        printingId = printing.id;
        if (isFoil && !printing.finishes.includes("foil")) {
          isFoil = false;
          warnings.push(
            /* v8 ignore next */
            `${r.matchedName ?? r.parsed.name} (${r.parsed.set} ${r.parsed.collectorNumber}) is not available in foil; importing as nonfoil.`,
          );
        }
      }
    }

    return {
      parsed: r.parsed,
      cardId: r.cardId,
      matchedName: r.matchedName,
      fuzzy: r.fuzzy,
      printingId,
      isFoil,
    };
  });

  return { resolved, unmatched, warnings };
}
