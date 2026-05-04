import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Zone } from "@/lib/generated/prisma/enums";
import type { DeckCard } from "@/lib/deck/zone-view";
import { axe } from "@/test/a11y";
import { DrawHand } from "./draw-hand";

// next/image renders fine in jsdom — no mock needed for the attributes we check.

function makeDeckCard(
  id: string,
  cardName: string,
  quantity: number,
  zone: Zone,
): DeckCard {
  return {
    id,
    deckId: "deck-1",
    cardId: Number(id.replace(/\D/g, "")) || 0,
    quantity,
    zone,
    category: null,
    printingId: null,
    isFoil: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    card: {
      id: Number(id.replace(/\D/g, "")) || 0,
      name: cardName,
      mainType: "Instant",
      printings: [],
    },
    printing: null,
  } as unknown as DeckCard;
}

const cards60: DeckCard[] = Array.from({ length: 4 }, (_, i) =>
  makeDeckCard(`card-${i}`, `Card ${i}`, 15, "MAINBOARD"),
);

describe("DrawHand", () => {
  it("has no a11y violations", async () => {
    const { container } = render(<DrawHand cards={cards60} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders only the Draw button before any hand is drawn", () => {
    render(<DrawHand cards={cards60} />);
    expect(screen.getByRole("button", { name: /draw a 7-card/i })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("empty mainboard shows a zero-state and no draw button", () => {
    render(<DrawHand cards={[]} />);
    expect(screen.getByText(/no cards in mainboard/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /draw/i })).not.toBeInTheDocument();
  });

  it("clicking Draw renders 7 cards when the mainboard has ≥7", async () => {
    const user = userEvent.setup();
    render(<DrawHand cards={cards60} />);

    await user.click(screen.getByRole("button", { name: /draw a 7-card/i }));

    const list = screen.getByRole("list", { name: /drawn hand/i });
    expect(list).toHaveAttribute("aria-label", "Drawn hand: 7 cards");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(7);
  });

  it("draws fewer cards when the mainboard has fewer than 7", async () => {
    const user = userEvent.setup();
    const small = [makeDeckCard("c1", "Island", 3, "MAINBOARD")];
    render(<DrawHand cards={small} />);

    await user.click(screen.getByRole("button", { name: /draw a 7-card/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("mulligan reduces next-draw hand size (7 → 6 → 5)", async () => {
    const user = userEvent.setup();
    render(<DrawHand cards={cards60} />);

    await user.click(screen.getByRole("button", { name: /draw a 7-card/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);

    await user.click(screen.getByRole("button", { name: /mulligan to 6 cards/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: /mulligan to 5 cards/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("mulligan button disables at a minimum hand size of 1", async () => {
    const user = userEvent.setup();
    render(<DrawHand cards={cards60} />);

    await user.click(screen.getByRole("button", { name: /draw a 7-card/i }));
    // 7 → 6 → 5 → 4 → 3 → 2 → 1
    for (let i = 6; i >= 1; i--) {
      await user.click(
        screen.getByRole("button", { name: new RegExp(`mulligan to ${i}`, "i") }),
      );
    }
    // At hand size 1, the button is disabled.
    expect(screen.getByRole("button", { name: /mulligan/i })).toBeDisabled();
  });

  it("reset returns the component to its initial Draw-only state", async () => {
    const user = userEvent.setup();
    render(<DrawHand cards={cards60} />);

    await user.click(screen.getByRole("button", { name: /draw a 7-card/i }));
    await user.click(screen.getByRole("button", { name: /mulligan to 6/i }));
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /draw a 7-card/i })).toBeInTheDocument();
  });
});
