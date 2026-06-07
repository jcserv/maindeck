import type { HoldingState } from "@/lib/generated/prisma/enums";

export type OwnershipState = "NOT_OWNED" | "PARTIAL" | "OWNED" | "WISHLIST";

export type PartialReason = "foil-mismatch" | "different-printing";

export interface ViewerHolding {
  cardId: number;
  // Null for synthetic WISHLIST holdings backed by an unpinned wishlist-deck
  // DeckCard. Compute only matches printingId in the pinned-DeckCard branch, so
  // a null here never spuriously matches an exact (printing, foil) pin.
  printingId: number | null;
  isFoil: boolean;
  state: HoldingState;
}

export interface OwnershipResolution {
  state: OwnershipState;
  partialReason?: PartialReason;
}

interface ComputeInput {
  cardId: number;
  printingId: number | null;
  isFoil: boolean;
}

/**
 * Pure projection of a DeckCard against the viewer's holdings.
 *
 * Pinned DeckCard (printingId !== null):
 *   exact (printing, isFoil) OWNED -> OWNED;
 *   exact (printing, isFoil) WISHLIST -> WISHLIST;
 *   same printing, mismatched isFoil, OWNED -> PARTIAL (foil-mismatch);
 *   same card, different printing, OWNED -> PARTIAL (different-printing);
 *   else NOT_OWNED.
 *
 * Unpinned DeckCard (printingId === null): the deck doesn't care which
 * printing, so any owned holding of the same card -> OWNED. Wishlist falls
 * back only when there's no owned holding. PARTIAL never applies.
 *
 * No basic-land short-circuit (naive rule, per spec §10.a).
 */
export function computeOwnershipState(
  dc: ComputeInput,
  holdings: readonly ViewerHolding[],
): OwnershipResolution {
  if (dc.printingId === null) {
    let wishlisted = false;
    for (const h of holdings) {
      if (h.cardId !== dc.cardId) continue;
      if (h.state === "OWNED") return { state: "OWNED" };
      // Only WISHLIST remains (HoldingState is OWNED | WISHLIST).
      wishlisted = true;
    }
    return wishlisted ? { state: "WISHLIST" } : { state: "NOT_OWNED" };
  }

  let foilMismatchOwned: ViewerHolding | null = null;
  let differentPrintingOwned: ViewerHolding | null = null;

  for (const h of holdings) {
    if (h.cardId !== dc.cardId) continue;
    if (h.printingId === dc.printingId && h.isFoil === dc.isFoil) {
      return h.state === "WISHLIST"
        ? { state: "WISHLIST" }
        : { state: "OWNED" };
    }
    if (h.state !== "OWNED") continue;
    if (h.printingId === dc.printingId) {
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
