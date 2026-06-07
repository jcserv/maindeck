import { describe, expect, it } from "vitest";
import { computeOwnershipState, type ViewerHolding } from "../state";

const CARD = 1;
const PRINTING = 10;
const OTHER_PRINTING = 11;

function dc(input: Partial<{ printingId: number | null; isFoil: boolean }> = {}) {
  return {
    cardId: CARD,
    printingId: input.printingId === undefined ? PRINTING : input.printingId,
    isFoil: input.isFoil ?? false,
  };
}

describe("computeOwnershipState", () => {
  it("returns NOT_OWNED when no holdings", () => {
    expect(computeOwnershipState(dc(), [])).toEqual({ state: "NOT_OWNED" });
  });

  it("returns NOT_OWNED when holdings reference a different card", () => {
    const holdings: ViewerHolding[] = [
      { cardId: 999, printingId: PRINTING, isFoil: false, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc(), holdings)).toEqual({ state: "NOT_OWNED" });
  });

  it("returns OWNED when (printing, foil) matches exactly — non-foil", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: PRINTING, isFoil: false, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc({ isFoil: false }), holdings)).toEqual({
      state: "OWNED",
    });
  });

  it("returns OWNED when (printing, foil) matches exactly — foil", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: PRINTING, isFoil: true, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc({ isFoil: true }), holdings)).toEqual({
      state: "OWNED",
    });
  });

  it("returns WISHLIST when exact match has state WISHLIST", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: PRINTING, isFoil: false, state: "WISHLIST" },
    ];
    expect(computeOwnershipState(dc(), holdings)).toEqual({ state: "WISHLIST" });
  });

  it("returns PARTIAL foil-mismatch when same printing but foil differs (own non-foil, deck foil)", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: PRINTING, isFoil: false, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc({ isFoil: true }), holdings)).toEqual({
      state: "PARTIAL",
      partialReason: "foil-mismatch",
    });
  });

  it("returns PARTIAL foil-mismatch when same printing but foil differs (own foil, deck non-foil)", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: PRINTING, isFoil: true, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc({ isFoil: false }), holdings)).toEqual({
      state: "PARTIAL",
      partialReason: "foil-mismatch",
    });
  });

  it("returns PARTIAL different-printing when same card different printing is OWNED", () => {
    const holdings: ViewerHolding[] = [
      {
        cardId: CARD,
        printingId: OTHER_PRINTING,
        isFoil: false,
        state: "OWNED",
      },
    ];
    expect(computeOwnershipState(dc(), holdings)).toEqual({
      state: "PARTIAL",
      partialReason: "different-printing",
    });
  });

  it("ignores WISHLIST rows when computing partial fallback", () => {
    const holdings: ViewerHolding[] = [
      {
        cardId: CARD,
        printingId: OTHER_PRINTING,
        isFoil: false,
        state: "WISHLIST",
      },
    ];
    expect(computeOwnershipState(dc(), holdings)).toEqual({ state: "NOT_OWNED" });
  });

  it("unpinned DeckCard: any owned printing of card yields OWNED (deck doesn't pin a printing)", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: OTHER_PRINTING, isFoil: false, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc({ printingId: null }), holdings)).toEqual({
      state: "OWNED",
    });
  });

  it("unpinned DeckCard: only WISHLIST holdings yield WISHLIST", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: OTHER_PRINTING, isFoil: false, state: "WISHLIST" },
    ];
    expect(computeOwnershipState(dc({ printingId: null }), holdings)).toEqual({
      state: "WISHLIST",
    });
  });

  it("unpinned DeckCard: skips holdings for a different card", () => {
    const holdings: ViewerHolding[] = [
      { cardId: 999, printingId: PRINTING, isFoil: false, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc({ printingId: null }), holdings)).toEqual({
      state: "NOT_OWNED",
    });
  });

  it("unpinned DeckCard: owned beats wishlist regardless of order", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: PRINTING, isFoil: false, state: "WISHLIST" },
      { cardId: CARD, printingId: OTHER_PRINTING, isFoil: false, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc({ printingId: null }), holdings)).toEqual({
      state: "OWNED",
    });
  });

  it("exact match wins over PARTIAL when both are present", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: OTHER_PRINTING, isFoil: false, state: "OWNED" },
      { cardId: CARD, printingId: PRINTING, isFoil: false, state: "OWNED" },
    ];
    expect(computeOwnershipState(dc(), holdings)).toEqual({ state: "OWNED" });
  });

  it("WISHLIST at exact key beats different-printing OWNED (exact match precedence)", () => {
    const holdings: ViewerHolding[] = [
      { cardId: CARD, printingId: OTHER_PRINTING, isFoil: false, state: "OWNED" },
      { cardId: CARD, printingId: PRINTING, isFoil: false, state: "WISHLIST" },
    ];
    expect(computeOwnershipState(dc(), holdings)).toEqual({ state: "WISHLIST" });
  });
});
