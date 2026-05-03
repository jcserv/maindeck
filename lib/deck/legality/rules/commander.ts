import { Zone } from "@/lib/generated/prisma/enums";
import type {
  DeckSnapshot,
  LegalityIssue,
} from "@/lib/deck/mutation/types";
import { colorIdentityRule, singletonRule, type LegalityRule } from "../shared";
import { COMMANDER_DECK_SIZE } from "../constants";

function commanderDeckSizeRule(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const mainboard = snap.cards.filter((c) => c.zone === Zone.MAINBOARD);
  const commanderZone = snap.cards.filter((c) => c.zone === Zone.COMMANDER);
  const total =
    mainboard.reduce((s, c) => s + c.quantity, 0) +
    commanderZone.reduce((s, c) => s + c.quantity, 0);
  if (total !== COMMANDER_DECK_SIZE) {
    issues.push({ kind: "deck_size", expected: COMMANDER_DECK_SIZE, actual: total });
  }
  if (commanderZone.length === 0) {
    issues.push({ kind: "no_commander" });
  }
  return issues;
}

export const commanderRules: LegalityRule[] = [
  singletonRule,
  colorIdentityRule,
  commanderDeckSizeRule,
];
