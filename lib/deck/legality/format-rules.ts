import { Format } from "@/lib/generated/prisma/enums";
import {
  colorIdentityRule,
  singletonRule,
  type LegalityRule,
} from "./shared";
import { brawlRules } from "./rules/brawl";
import { commanderRules } from "./rules/commander";
import { oathbreakerRules } from "./rules/oathbreaker";
import { sixtyCardRules } from "./rules/sixty-card";

export const formatRules: Record<Format, LegalityRule[]> = {
  [Format.COMMANDER]: commanderRules,
  [Format.BRAWL]: brawlRules,
  [Format.OATHBREAKER]: oathbreakerRules,
  [Format.STANDARD]: sixtyCardRules,
  [Format.PIONEER]: sixtyCardRules,
  [Format.MODERN]: sixtyCardRules,
  [Format.LEGACY]: sixtyCardRules,
  [Format.VINTAGE]: sixtyCardRules,
  [Format.PAUPER]: sixtyCardRules,
  [Format.HISTORIC]: sixtyCardRules,
  [Format.EXPLORER]: sixtyCardRules,
  [Format.ALCHEMY]: sixtyCardRules,
  [Format.CASUAL]: [],
};

export function isSingletonFormat(format: Format): boolean {
  return formatRules[format].includes(singletonRule);
}

export function isColorIdentityFormat(format: Format): boolean {
  return formatRules[format].includes(colorIdentityRule);
}
