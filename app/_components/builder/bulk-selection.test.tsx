import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/_actions/deck/bulk-actions", () => ({
  applyBulkCardAction: vi.fn().mockResolvedValue(undefined),
}));

import { applyBulkCardAction } from "@/app/_actions/deck/bulk-actions";
import { BulkActionBar } from "./bulk-action-bar";
import { BulkSelectionProvider, useRowSelection } from "./bulk-selection";
import type { DeckCard } from "@/lib/deck/zone-view";

const mockApply = vi.mocked(applyBulkCardAction);

function deckCard(
  id: string,
  categories: string[],
  ghost?: string,
): DeckCard {
  return {
    id,
    zone: "MAINBOARD",
    categories,
    quantity: 1,
    card: { name: `Card ${id}` },
    ...(ghost && { isSecondary: true, sectionCategory: ghost }),
  } as unknown as DeckCard;
}

function Row({ dc }: { dc: DeckCard }) {
  const { attrs, onClick } = useRowSelection(dc);
  return (
    <li {...attrs} onClick={onClick}>
      {dc.card.name}
      {dc.isSecondary ? ` (${dc.sectionCategory})` : ""}
    </li>
  );
}

const A = deckCard("a", ["ramp"]);
const B = deckCard("b", ["ramp", "draw"]);
const B_GHOST = deckCard("b", ["ramp", "draw"], "draw");
const C = deckCard("c", ["draw"]);
const CARDS = [A, B, C];

function Harness({ dispatch = vi.fn() }: { dispatch?: () => void }) {
  return (
    <BulkSelectionProvider cards={CARDS}>
      <ul>
        {[A, B, C, B_GHOST].map((dc, i) => (
          <Row key={i} dc={dc} />
        ))}
      </ul>
      <BulkActionBar
        deckId="deck-1"
        cards={CARDS}
        dispatch={dispatch}
        subcategories={["ramp", "draw"]}
        commanderSet={false}
      />
    </BulkSelectionProvider>
  );
}

function selectedRows() {
  return [...document.querySelectorAll("[data-selected]")].map(
    (el) => el.textContent,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("bulk selection", () => {
  it("plain clicks don't select until a modifier-click enters select mode", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText("Card a"));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    await user.keyboard("{Meta>}");
    await user.click(screen.getByText("Card a"));
    await user.keyboard("{/Meta}");
    await user.click(screen.getByText("Card c"));

    expect(selectedRows()).toEqual(["Card a", "Card c"]);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("Shift-click selects the visual range, ghost rows included", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("{Meta>}");
    await user.click(screen.getByText("Card b"));
    await user.keyboard("{/Meta}{Shift>}");
    await user.click(screen.getByText("Card b (draw)"));
    await user.keyboard("{/Shift}");

    expect(selectedRows()).toEqual(["Card b", "Card c", "Card b (draw)"]);
  });

  it("deleting a ghost-only selection strips that membership in one bulk call", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<Harness dispatch={dispatch} />);

    await user.keyboard("{Meta>}");
    await user.click(screen.getByText("Card b (draw)"));
    await user.keyboard("{/Meta}");
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "move",
      deckCardId: "b",
      zone: "MAINBOARD",
      categories: ["ramp"],
    });
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(
      "deck-1",
      [{ deckCardId: "b", viaCategory: "draw" }],
      { kind: "remove" },
    );
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("deleting primary rows removes those DeckCards from the deck", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<Harness dispatch={dispatch} />);

    await user.keyboard("{Meta>}");
    await user.click(screen.getByText("Card a"));
    await user.click(screen.getByText("Card c"));
    await user.keyboard("{/Meta}");
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(await screen.findByText("Delete 2 cards?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(dispatch.mock.calls).toEqual([
      [{ type: "remove", deckCardId: "a" }],
      [{ type: "remove", deckCardId: "c" }],
    ]);
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it("Escape exits select mode and clears the selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("{Meta>}");
    await user.click(screen.getByText("Card a"));
    await user.keyboard("{/Meta}{Escape}");

    expect(selectedRows()).toEqual([]);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
