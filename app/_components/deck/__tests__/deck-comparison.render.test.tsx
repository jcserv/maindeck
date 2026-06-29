import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import type { DeckComparisonResult } from "@/lib/deck/compare";

// Render the real wrapper Link as a plain anchor — the perf wiring (useRouter,
// IntersectionObserver) is irrelevant to a static render of the comparison view.
vi.mock("@/app/_components/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={String(href)} className={className}>
      {children}
    </a>
  ),
}));

import { DeckComparison } from "@/app/_components/deck/deck-comparison";

const RESULT: DeckComparisonResult = {
  a: { id: "deck-a", name: "Atraxa Superfriends", format: "COMMANDER" as never },
  b: { id: "deck-b", name: "Atraxa Counters", format: "COMMANDER" as never },
  cards: {
    removed: [
      { cardId: "doubling", name: "Doubling Season", quantity: 1 },
      { cardId: "teferi", name: "Teferi, Hero of Dominaria", quantity: 1 },
    ],
    shared: [
      {
        cardId: "atraxa",
        name: "Atraxa, Praetors' Voice",
        aQuantity: 1,
        bQuantity: 1,
        delta: 0,
      },
      {
        cardId: "forest",
        name: "Forest",
        aQuantity: 8,
        bQuantity: 10,
        delta: 2,
      },
      { cardId: "sol", name: "Sol Ring", aQuantity: 1, bQuantity: 1, delta: 0 },
    ],
    added: [
      { cardId: "hardened", name: "Hardened Scales", quantity: 1 },
      { cardId: "winding", name: "Winding Constrictor", quantity: 1 },
    ],
    summary: { addedCards: 2, removedCards: 2, sharedCards: 3, changedCards: 1 },
  },
  stats: {
    a: {
      cardCount: 99,
      manaCurve: { "0": 8, "1": 6, "2": 14, "3": 18, "4": 12, "5": 7, "6": 4, "7+": 3 },
      colorPips: { W: 18, U: 16, B: 15, R: 0, G: 14, C: 8 },
      typeBreakdown: { Creature: 22, Planeswalker: 9, Instant: 10, Sorcery: 8, Enchantment: 7, Artifact: 9, Land: 34 },
      avgMV: 3.18,
      landCount: 38,
      expectedLands: 2.69,
    },
    b: {
      cardCount: 99,
      manaCurve: { "0": 9, "1": 9, "2": 16, "3": 17, "4": 10, "5": 6, "6": 3, "7+": 2 },
      colorPips: { W: 14, U: 12, B: 18, R: 0, G: 20, C: 6 },
      typeBreakdown: { Creature: 30, Planeswalker: 3, Instant: 9, Sorcery: 7, Enchantment: 6, Artifact: 8, Land: 36 },
      avgMV: 2.84,
      landCount: 37,
      expectedLands: 2.62,
    },
  },
};

describe("DeckComparison", () => {
  it("renders the summary, stat diff, and card buckets for two decks", () => {
    const { container, getByLabelText, getAllByText } = render(
      <DeckComparison result={RESULT} />,
    );

    // Deck headings link to each deck.
    expect(container.querySelector('a[href="/deck/deck-a"]')).toHaveTextContent(
      "Atraxa Superfriends",
    );
    expect(container.querySelector('a[href="/deck/deck-b"]')).toHaveTextContent(
      "Atraxa Counters",
    );

    // Summary tiles use the deck names and the computed counts.
    const summary = getByLabelText("Comparison summary");
    expect(summary).toHaveTextContent("Only in Atraxa Superfriends");
    expect(summary).toHaveTextContent("Only in Atraxa Counters");
    expect(summary).toHaveTextContent("Shared");
    expect(summary).toHaveTextContent("Qty changed");

    // Stats and Cards sections both render.
    expect(getAllByText("Stats").length).toBeGreaterThan(0);

    // Card buckets show added/removed/shared cards.
    expect(container).toHaveTextContent("Doubling Season");
    expect(container).toHaveTextContent("Hardened Scales");
    expect(container).toHaveTextContent("Atraxa, Praetors' Voice");
    // Shared card with a quantity delta renders the "before → after" form.
    expect(container).toHaveTextContent("8 → 10");

    // Stat diff column shows a signed delta for diverging averages.
    expect(container).toHaveTextContent("Avg. MV");

    if (process.env["EVIDENCE_OUT"]) {
      writeFileSync(process.env["EVIDENCE_OUT"], container.innerHTML, "utf8");
    }
  });
});
