export type SubCard = {
  name: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
};

const cardlineRegex =
  /^(\d+)\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+(\S+))?(?:\s+\[([A-Za-z0-9]+)\])?(?:\s+\*F\*)?$/;
const foilSuffixRegex = /\s\*F\*\s*$/;
const trailingCommentRegex = /\s*#.*$/;
const mdfcSingleSlashRegex = /\s\/\s(?!\/)/g;

function normalizeMdfcName(name: string): string {
  return name.replace(mdfcSingleSlashRegex, " // ");
}

export function parseDeckList(input: string): SubCard[] {
  const lines = input.split("\n");
  const cardMap = new Map<string, SubCard>();

  for (const raw of lines) {
    const stripped = raw.trim().replace(trailingCommentRegex, "");
    const isFoil = foilSuffixRegex.test(stripped);
    const match = stripped.match(cardlineRegex);
    if (!match) continue;

    const [, quantityStr, rawName, set, collectorNumber, alternateSet] = match;
    if (quantityStr === undefined || rawName === undefined) continue;
    const quantity = parseInt(quantityStr, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const name = normalizeMdfcName(rawName);
    const resolvedSet = set ?? alternateSet;
    const key = `${name}|${resolvedSet ?? ""}|${collectorNumber ?? ""}|${isFoil}`;

    const existing = cardMap.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    cardMap.set(key, {
      name,
      quantity,
      set: resolvedSet?.toUpperCase(),
      collectorNumber,
      isFoil,
    });
  }

  return Array.from(cardMap.values());
}
