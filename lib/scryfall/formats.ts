export const MTG_FORMATS = [
  "standard",
  "future",
  "historic",
  "timeless",
  "gladiator",
  "pioneer",
  "explorer",
  "modern",
  "legacy",
  "pauper",
  "vintage",
  "penny",
  "commander",
  "oathbreaker",
  "standardbrawl",
  "brawl",
  "alchemy",
  "paupercommander",
  "duel",
  "oldschool",
  "premodern",
  "predh",
] as const;

export type MtgFormat = (typeof MTG_FORMATS)[number];

export type LegalityStatus = "legal" | "not_legal" | "banned" | "restricted";

const FORMAT_SET: ReadonlySet<string> = new Set(MTG_FORMATS);
const STATUS_SET: ReadonlySet<string> = new Set([
  "legal",
  "not_legal",
  "banned",
  "restricted",
]);

export function normalizeLegalities(
  raw: Record<string, string> | undefined,
): Record<MtgFormat, LegalityStatus> {
  const out = {} as Record<MtgFormat, LegalityStatus>;
  for (const fmt of MTG_FORMATS) out[fmt] = "not_legal";
  if (!raw) return out;
  for (const [fmt, status] of Object.entries(raw)) {
    if (FORMAT_SET.has(fmt) && STATUS_SET.has(status)) {
      out[fmt as MtgFormat] = status as LegalityStatus;
    }
  }
  return out;
}
