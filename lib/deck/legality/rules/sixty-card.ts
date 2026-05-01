import { Zone } from "@/lib/generated/prisma/enums";
import type {
  DeckSnapshot,
  LegalityIssue,
} from "@/lib/deck/mutation/types";
import type { LegalityRule } from "../shared";

function sixtyCardSizeRule(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const mainboard = snap.cards.filter((c) => c.zone === Zone.MAINBOARD);
  const sideboard = snap.cards.filter((c) => c.zone === Zone.SIDEBOARD);
  const mainTotal = mainboard.reduce((s, c) => s + c.quantity, 0);
  if (mainTotal < 60) {
    issues.push({
      code: "deck_size",
      message: `Mainboard must have at least 60 cards (currently ${mainTotal})`,
    });
  }
  const sideTotal = sideboard.reduce((s, c) => s + c.quantity, 0);
  if (sideTotal > 15) {
    issues.push({
      code: "sideboard_size",
      message: `Sideboard may have at most 15 cards (currently ${sideTotal})`,
    });
  }
  return issues;
}

export const sixtyCardRules: LegalityRule[] = [sixtyCardSizeRule];
