import { Zone } from "@/lib/generated/prisma/enums";
import type {
  DeckSnapshot,
  LegalityIssue,
} from "@/lib/deck/mutation/types";
import { colorIdentityRule, singletonRule, type LegalityRule } from "../shared";

function commanderDeckSizeRule(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const mainboard = snap.cards.filter((c) => c.zone === Zone.MAINBOARD);
  const commanderZone = snap.cards.filter((c) => c.zone === Zone.COMMANDER);
  const total =
    mainboard.reduce((s, c) => s + c.quantity, 0) +
    commanderZone.reduce((s, c) => s + c.quantity, 0);
  if (total !== 100) {
    issues.push({
      code: "deck_size",
      message: `Commander decks must have exactly 100 cards (currently ${total})`,
    });
  }
  if (commanderZone.length === 0) {
    issues.push({
      code: "no_commander",
      message:
        "Commander decks must have exactly one card in the commander zone",
    });
  }
  return issues;
}

export const commanderRules: LegalityRule[] = [
  singletonRule,
  colorIdentityRule,
  commanderDeckSizeRule,
];
