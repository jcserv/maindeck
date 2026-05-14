import type { HoldingState } from "@/lib/generated/prisma/enums";

export type OwnershipState = "NOT_OWNED" | "PARTIAL" | "OWNED" | "WISHLIST";

export type PartialReason = "foil-mismatch" | "different-printing";

export interface ViewerHolding {
  cardId: number;
  printingId: number;
  isFoil: boolean;
  state: HoldingState;
}

export interface OwnershipResolution {
  state: OwnershipState;
  partialReason?: PartialReason;
}

export interface ComputeInput {
  cardId: number;
  printingId: number | null;
  isFoil: boolean;
}

/**
 * Pure projection of a DeckCard against the viewer's holdings.
 *
 * Rule precedence: exact (printing, isFoil) OWNED -> OWNED;
 * exact (printing, isFoil) WISHLIST -> WISHLIST;
 * same printing, mismatched isFoil, OWNED -> PARTIAL (foil-mismatch);
 * same card, different printing, OWNED -> PARTIAL (different-printing);
 * else NOT_OWNED.
 *
 * No basic-land short-circuit (naive rule, per spec §10.a).
 */
export function computeOwnershipState(
  dc: ComputeInput,
  holdings: readonly ViewerHolding[],
): OwnershipResolution {
  let foilMismatchOwned: ViewerHolding | null = null;
  let differentPrintingOwned: ViewerHolding | null = null;

  for (const h of holdings) {
    if (h.cardId !== dc.cardId) continue;
    if (
      dc.printingId !== null &&
      h.printingId === dc.printingId &&
      h.isFoil === dc.isFoil
    ) {
      return h.state === "WISHLIST"
        ? { state: "WISHLIST" }
        : { state: "OWNED" };
    }
    if (h.state !== "OWNED") continue;
    if (dc.printingId !== null && h.printingId === dc.printingId) {
      foilMismatchOwned = h;
      continue;
    }
    differentPrintingOwned = h;
  }

  if (foilMismatchOwned) {
    return { state: "PARTIAL", partialReason: "foil-mismatch" };
  }
  if (differentPrintingOwned) {
    return { state: "PARTIAL", partialReason: "different-printing" };
  }
  return { state: "NOT_OWNED" };
}
