import { Zone, type Format } from "@/lib/generated/prisma/enums";
import { isSingletonFormat } from "@/lib/deck/legality/format-rules";
import { isBasicLandCard } from "@/lib/deck/legality/shared";
import type { PlannedChange } from "@/lib/deck/mutation/types";

export type PackageCard = {
  cardId: number;
  cardName: string;
  typeLine: string | null;
  zone: Zone;
  quantity: number;
  printingId: number | null;
  isFoil: boolean;
  /** Ordered category memberships; `[0]` is the primary. */
  categories: string[];
};

type PackageApplyPlan = {
  changes: PlannedChange[];
  /** Names of package cards left out because the deck already has them. */
  skipped: string[];
};

function targetZone(zone: Zone): Zone {
  return zone === Zone.COMMANDER || zone === Zone.COMPANION
    ? Zone.MAINBOARD
    : zone;
}

/**
 * Plan the one-time copy of a package's cards into a deck. Cards the deck
 * already holds (in any zone) are skipped so re-applying a package is a no-op.
 * Command-zone package cards land in the mainboard, since a package can't
 * pick the target deck's commander. Singleton formats get one copy of each
 * non-basic.
 */
export function planPackageApply(
  packageCards: readonly PackageCard[],
  existingCardIds: ReadonlySet<number>,
  format: Format,
): PackageApplyPlan {
  const singleton = isSingletonFormat(format);
  const present = new Set(existingCardIds);
  const changes: PlannedChange[] = [];
  const skipped: string[] = [];

  for (const card of packageCards) {
    if (present.has(card.cardId)) {
      skipped.push(card.cardName);
      continue;
    }
    const basic = isBasicLandCard(card.typeLine, card.cardName);
    if (singleton && !basic) present.add(card.cardId);

    const zone = targetZone(card.zone);
    changes.push({
      op: "add",
      cardId: card.cardId,
      quantity: singleton && !basic ? 1 : card.quantity,
      zone,
      categories: zone === Zone.MAINBOARD ? [...card.categories] : [],
      printingId: card.printingId,
      isFoil: card.isFoil,
    });
  }

  return { changes, skipped };
}
