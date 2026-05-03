import { Zone } from "@/lib/generated/prisma/enums";
import type {
  DeckSnapshot,
  LegalityIssue,
} from "@/lib/deck/mutation/types";
import type { LegalityRule } from "../shared";
import { SIXTY_CARD_MIN, SIDEBOARD_MAX } from "../constants";

function sixtyCardSizeRule(snap: DeckSnapshot): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const mainboard = snap.cards.filter((c) => c.zone === Zone.MAINBOARD);
  const sideboard = snap.cards.filter((c) => c.zone === Zone.SIDEBOARD);
  const mainTotal = mainboard.reduce((s, c) => s + c.quantity, 0);
  if (mainTotal < SIXTY_CARD_MIN) {
    issues.push({ kind: "deck_size", expected: SIXTY_CARD_MIN, actual: mainTotal });
  }
  const sideTotal = sideboard.reduce((s, c) => s + c.quantity, 0);
  if (sideTotal > SIDEBOARD_MAX) {
    issues.push({ kind: "sideboard_size", expected: SIDEBOARD_MAX, actual: sideTotal });
  }
  return issues;
}

export const sixtyCardRules: LegalityRule[] = [sixtyCardSizeRule];
