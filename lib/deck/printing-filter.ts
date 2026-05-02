import type { ClientPrinting } from "@/lib/card/printing-types";

export interface SetOption {
  setCode: string;
  setName: string;
  count: number;
}

type FilterablePrinting = Pick<
  ClientPrinting,
  "setName" | "setCode" | "collectorNumber"
>;

export function filterPrintings<T extends FilterablePrinting>(
  printings: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...printings];
  return printings.filter(
    (p) =>
      p.setName.toLowerCase().includes(q) ||
      p.setCode.toLowerCase().includes(q) ||
      p.collectorNumber.toLowerCase().includes(q),
  );
}

export function buildSetSuggestions(
  printings: readonly FilterablePrinting[],
  query: string,
): SetOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byCode = new Map<string, SetOption>();
  for (const p of printings) {
    if (
      !p.setName.toLowerCase().includes(q) &&
      !p.setCode.toLowerCase().includes(q)
    )
      continue;
    const existing = byCode.get(p.setCode);
    if (existing) existing.count += 1;
    else
      byCode.set(p.setCode, {
        setCode: p.setCode,
        setName: p.setName,
        count: 1,
      });
  }
  return Array.from(byCode.values()).sort((a, b) =>
    a.setName.localeCompare(b.setName),
  );
}

export function isExactSingleSetMatch(
  suggestions: readonly SetOption[],
  query: string,
): boolean {
  return (
    suggestions.length === 1 &&
    suggestions[0]!.setName.toLowerCase() === query.trim().toLowerCase()
  );
}
