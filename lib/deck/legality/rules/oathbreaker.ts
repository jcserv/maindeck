import { colorIdentityRule, singletonRule, type LegalityRule } from "../shared";

export const oathbreakerRules: LegalityRule[] = [
  singletonRule,
  colorIdentityRule,
];
