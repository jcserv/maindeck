import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { Deck, DeckCard } from "@/lib/deck/zone-view";
import { axe } from "@/test/a11y";

const renameCategoryMock = vi.fn();
const deleteCategoryMock = vi.fn();
const reorderCategoriesMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("group=category"),
}));

vi.mock("@/app/_actions/deck/categories", () => ({
  renameCategory: (...args: unknown[]) => renameCategoryMock(...args),
  deleteCategory: (...args: unknown[]) => deleteCategoryMock(...args),
  reorderCategories: (...args: unknown[]) => reorderCategoriesMock(...args),
}));

vi.mock("@/app/_components/header-search-context", () => ({
  useHeaderSearch: () => ({ focus: vi.fn() }),
}));

import { Decklist } from "../decklist";
import { DecklistDnd } from "../decklist-dnd";

const DECK_ID = "deck-1";

function makeDeck(categories: string[]): Deck {
  return {
    id: DECK_ID,
    name: "Test Deck",
    format: "STANDARD",
    visibility: "PRIVATE",
    description: null,
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    cards: [],
    user: { id: "user-1", name: "Tester", image: null },
    categories: categories.map((name, i) => ({
      id: `cat-${i}`,
      name,
      sortOrder: i,
      deckId: DECK_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  } as unknown as Deck;
}

function renderWithDnd(node: ReactNode) {
  return render(<DndContext>{node}</DndContext>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Decklist - category controls", () => {
  it("has no a11y violations", async () => {
    const deck = makeDeck(["Ramp", "Removal"]);
    const { container } = renderWithDnd(
      <DecklistDnd deck={deck} cards={[]} dispatch={vi.fn()} isOwner={true} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  }, 15000);

  it("does not render the actions menu on the Uncategorized section", () => {
    const cards: DeckCard[] = [
      {
        id: "dc-1",
        deckId: DECK_ID,
        cardId: 1,
        quantity: 1,
        zone: "MAINBOARD",
        category: null,
        printingId: null,
        isFoil: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        card: { id: 1, name: "Forest", mainType: "Land", printings: [] },
        printing: null,
      } as unknown as DeckCard,
    ];
    const deck = makeDeck([]);
    renderWithDnd(
      <DecklistDnd deck={deck} cards={cards} dispatch={vi.fn()} isOwner={true} />,
    );

    const section = screen.getByRole("region", { name: /uncategorized/i });
    expect(
      within(section).queryByRole("button", { name: /actions for/i }),
    ).toBeNull();
  });

  it("does not render the actions menu on the Commander section", () => {
    const deck = makeDeck([]);
    deck.format = "COMMANDER";
    renderWithDnd(
      <DecklistDnd deck={deck} cards={[]} dispatch={vi.fn()} isOwner={true} />,
    );

    const commander = screen.getByRole("region", { name: /commander/i });
    expect(
      within(commander).queryByRole("button", { name: /actions for/i }),
    ).toBeNull();
  });

  it("category section exposes an actions menu and supports inline rename", async () => {
    const user = userEvent.setup();
    renameCategoryMock.mockResolvedValue(undefined);
    const deck = makeDeck(["Ramp"]);
    renderWithDnd(
      <DecklistDnd deck={deck} cards={[]} dispatch={vi.fn()} isOwner={true} />,
    );

    const section = screen.getByRole("region", { name: /^ramp/i });
    expect(
      within(section).getByRole("button", { name: /actions for ramp/i }),
    ).toBeInTheDocument();

    const heading = within(section).getByRole("heading", { name: /ramp/i });
    await user.dblClick(heading);

    const input = await within(section).findByLabelText(/rename ramp/i);
    await user.clear(input);
    await user.type(input, "Acceleration");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(renameCategoryMock).toHaveBeenCalledWith(
        DECK_ID,
        "Ramp",
        "Acceleration",
      ),
    );
  });

  it("surfaces a friendly rename error inline and keeps the input open", async () => {
    const user = userEvent.setup();
    renameCategoryMock.mockRejectedValue(
      new Error('Category "Removal" already exists'),
    );
    const deck = makeDeck(["Ramp"]);
    renderWithDnd(
      <DecklistDnd deck={deck} cards={[]} dispatch={vi.fn()} isOwner={true} />,
    );

    const section = screen.getByRole("region", { name: /^ramp/i });
    await user.dblClick(within(section).getByRole("heading", { name: /ramp/i }));
    const input = await within(section).findByLabelText(/rename ramp/i);
    await user.clear(input);
    await user.type(input, "Removal");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/rename failed/i);
    expect(within(section).getByLabelText(/rename ramp/i)).toBeInTheDocument();
  });

  it("delete menu item opens the dialog and routes through the selected mode", async () => {
    const user = userEvent.setup();
    deleteCategoryMock.mockResolvedValue(undefined);
    const deck = makeDeck(["Ramp"]);
    renderWithDnd(
      <DecklistDnd deck={deck} cards={[]} dispatch={vi.fn()} isOwner={true} />,
    );

    const section = screen.getByRole("region", { name: /^ramp/i });
    await user.click(
      within(section).getByRole("button", { name: /actions for ramp/i }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /delete/i }),
    );

    const moveOption = await screen.findByRole("radio", {
      name: /move cards to uncategorized/i,
    });
    const deleteOption = screen.getByRole("radio", {
      name: /delete cards in this category/i,
    });
    expect(moveOption).toBeChecked();
    expect(deleteOption).not.toBeChecked();

    await user.click(deleteOption);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(deleteCategoryMock).toHaveBeenCalledWith(
        DECK_ID,
        "Ramp",
        "deleteCards",
      ),
    );
  });

  it("non-owner view omits the actions menu on category sections", () => {
    const deck = makeDeck(["Ramp"]);
    renderWithDnd(
      <Decklist deck={deck} cards={[]} dispatch={vi.fn()} isOwner={false} />,
    );

    const section = screen.getByRole("region", { name: /^ramp/i });
    expect(
      within(section).queryByRole("button", { name: /actions for/i }),
    ).toBeNull();
  });

  it("Move up swaps with the previous category; first category disables Move up", async () => {
    const user = userEvent.setup();
    reorderCategoriesMock.mockResolvedValue(undefined);
    const deck = makeDeck(["Ramp", "Removal", "Draw"]);
    renderWithDnd(
      <DecklistDnd deck={deck} cards={[]} dispatch={vi.fn()} isOwner={true} />,
    );

    // First category — Move up disabled
    await user.click(
      within(screen.getByRole("region", { name: /^ramp/i })).getByRole(
        "button",
        { name: /actions for ramp/i },
      ),
    );
    const firstMoveUp = await screen.findByRole("menuitem", { name: /move up/i });
    expect(firstMoveUp).toHaveAttribute("data-disabled");
    await user.keyboard("{Escape}");

    // Middle category — Move up swaps with previous
    await user.click(
      within(screen.getByRole("region", { name: /^removal/i })).getByRole(
        "button",
        { name: /actions for removal/i },
      ),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /move up/i }),
    );

    await waitFor(() =>
      expect(reorderCategoriesMock).toHaveBeenCalledWith(DECK_ID, [
        "Removal",
        "Ramp",
        "Draw",
      ]),
    );
  });

  it("Move down swaps with the next category; last category disables Move down", async () => {
    const user = userEvent.setup();
    reorderCategoriesMock.mockResolvedValue(undefined);
    const deck = makeDeck(["Ramp", "Removal", "Draw"]);
    renderWithDnd(
      <DecklistDnd deck={deck} cards={[]} dispatch={vi.fn()} isOwner={true} />,
    );

    // Last category — Move down disabled
    await user.click(
      within(screen.getByRole("region", { name: /^draw/i })).getByRole(
        "button",
        { name: /actions for draw/i },
      ),
    );
    const lastMoveDown = await screen.findByRole("menuitem", {
      name: /move down/i,
    });
    expect(lastMoveDown).toHaveAttribute("data-disabled");
    await user.keyboard("{Escape}");

    // Middle category — Move down swaps with next
    await user.click(
      within(screen.getByRole("region", { name: /^removal/i })).getByRole(
        "button",
        { name: /actions for removal/i },
      ),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /move down/i }),
    );

    await waitFor(() =>
      expect(reorderCategoriesMock).toHaveBeenCalledWith(DECK_ID, [
        "Ramp",
        "Draw",
        "Removal",
      ]),
    );
  });
});
