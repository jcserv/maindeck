import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReducer } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import {
  applyZoneOptimistic,
  type Deck,
  type DeckCard,
} from "@/lib/deck/zone-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("group=category&sort=name&dir=asc"),
  usePathname: () => "/deck/deck-1",
}));

vi.mock("@/app/_actions/deck/categories", () => ({
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategories: vi.fn(),
  moveCardTo: vi.fn(),
  moveCategoryCards: vi.fn(),
  setCardCategories: vi.fn(),
}));

vi.mock("@/lib/deck/editor-actions", () => ({
  updateCardQuantity: vi.fn(),
  removeCardFromDeck: vi.fn(),
}));

vi.mock("@/app/_components/header-search/header-search-context", () => ({
  useHeaderSearch: () => ({ focus: vi.fn() }),
}));

import { DecklistDnd } from "@/app/_components/builder/decklist-dnd";
import { DeckCardDetailActions } from "@/app/_components/builder/deck-card-detail-actions";
import { DeckPreviewProvider } from "@/app/_components/deck/deck-preview-pane";
import { moveCardTo, setCardCategories } from "@/app/_actions/deck/categories";
import { removeCardFromDeck } from "@/lib/deck/editor-actions";

const DECK_ID = "deck-1";
const CATEGORIES = ["ramp", "removal"];

function makeDeck(): Deck {
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
    categories: CATEGORIES.map((name, sortOrder) => ({ name, sortOrder })),
  } as unknown as Deck;
}

function mainboardCard(id: string, name: string): DeckCard {
  return {
    id,
    deckId: DECK_ID,
    cardId: id,
    quantity: 1,
    zone: "MAINBOARD",
    categories: [],
    printingId: null,
    isFoil: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    card: { id, name, mainType: "Creature", printings: [] },
    printing: null,
  } as unknown as DeckCard;
}

function Builder({
  initial,
  isOwner = true,
}: {
  initial: DeckCard[];
  isOwner?: boolean;
}) {
  const [cards, dispatch] = useReducer(applyZoneOptimistic, initial);
  const deck = makeDeck();
  return (
    <DeckPreviewProvider
      renderDetailActions={
        isOwner
          ? (previewCard) => (
              <DeckCardDetailActions
                previewCard={previewCard}
                deckId={DECK_ID}
                cards={cards}
                subcategories={CATEGORIES}
                dispatch={dispatch}
                ownershipOf={() => "NOT_OWNED"}
              />
            )
          : undefined
      }
    >
      <DndContext>
        <DecklistDnd
          deck={deck}
          cards={cards}
          dispatch={dispatch}
          isOwner={isOwner}
          viewerId="user-1"
          viewerHoldings={[]}
        />
      </DndContext>
    </DeckPreviewProvider>
  );
}

async function openDetail(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name }));
  const dialog = await screen.findByRole("dialog", { name });
  return { user, dialog };
}

async function openActionsMenu(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  await user.click(within(dialog).getByRole("button", { name: "Card actions" }));
  return screen.findByRole("menu");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

describe("card detail modal actions", () => {
  const cards = [mainboardCard("dc-zoo", "Zoo"), mainboardCard("dc-alpha", "Alpha")];

  it("shows a Card actions menu button instead of an inline actions panel", async () => {
    render(<Builder initial={cards} />);
    const { dialog } = await openDetail("Alpha");

    expect(within(dialog).getByRole("button", { name: "Card actions" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/remove from deck/i)).not.toBeInTheDocument();
  });

  it("hides the Card actions menu button from non-owners", async () => {
    render(<Builder initial={cards} isOwner={false} />);
    const { dialog } = await openDetail("Alpha");

    expect(within(dialog).queryByRole("button", { name: "Card actions" })).not.toBeInTheDocument();
  });

  it("lists every action and moves the card to Sideboard from the menu", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    const menu = await openActionsMenu(user, dialog);
    for (const name of [/add one/i, /remove one/i, /change printing/i, /remove from deck/i]) {
      expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
    }
    await user.click(within(menu).getByRole("tab", { name: "Zone" }));
    await user.click(within(menu).getByRole("menuitem", { name: /sideboard/i }));

    await waitFor(() =>
      expect(moveCardTo).toHaveBeenCalledWith(DECK_ID, "dc-alpha", "SIDEBOARD", null),
    );
  });

  it("closes the menu on Escape without closing the modal", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    await openActionsMenu(user, dialog);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Alpha" })).toBeInTheDocument();
  });

  it("does not page the modal with arrow keys while the menu is open", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    const menu = await openActionsMenu(user, dialog);
    fireEvent.keyDown(menu, { key: "ArrowRight" });

    expect(screen.queryByRole("dialog", { name: "Zoo" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Alpha" })).toBeInTheDocument();
  });

  it("assigns a category from the modal and reflects it without closing", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    const menu = await openActionsMenu(user, dialog);
    await user.click(within(menu).getByRole("tab", { name: "Category" }));
    await user.click(within(menu).getByRole("menuitem", { name: /^ramp/i }));

    await waitFor(() =>
      expect(setCardCategories).toHaveBeenCalledWith(DECK_ID, "dc-alpha", ["ramp"]),
    );
    expect(screen.getByRole("dialog", { name: "Alpha" })).toBeInTheDocument();
    expect(
      await within(screen.getByRole("menu")).findByLabelText("Primary category"),
    ).toBeInTheDocument();
  });

  it("targets the paged-to card after cycling", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    await user.click(within(dialog).getByRole("button", { name: /next card/i }));
    const zoo = screen.getByRole("dialog", { name: "Zoo" });
    const menu = await openActionsMenu(user, zoo);
    await user.click(within(menu).getByRole("tab", { name: "Category" }));
    await user.click(within(menu).getByRole("menuitem", { name: /^removal/i }));

    await waitFor(() =>
      expect(setCardCategories).toHaveBeenCalledWith(DECK_ID, "dc-zoo", ["removal"]),
    );
  });

  it("removes the card from the deck and closes the modal", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    const menu = await openActionsMenu(user, dialog);
    await user.click(within(menu).getByRole("menuitem", { name: /remove from deck/i }));

    await waitFor(() =>
      expect(removeCardFromDeck).toHaveBeenCalledWith(DECK_ID, "dc-alpha"),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
    });
  });

  it("closes the printing picker when the modal pages to another card", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    const menu = await openActionsMenu(user, dialog);
    await user.click(within(menu).getByRole("menuitem", { name: /change printing/i }));
    expect(await screen.findAllByRole("dialog", { hidden: true })).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole("button", { name: /next card/i, hidden: true }));

    await screen.findByRole("dialog", { name: "Zoo", hidden: true });
    await waitFor(() => expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1));
  });

  it("does not page the modal with arrow keys while the printing picker is open", async () => {
    render(<Builder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    const menu = await openActionsMenu(user, dialog);
    await user.click(within(menu).getByRole("menuitem", { name: /change printing/i }));
    const dialogs = await screen.findAllByRole("dialog", { hidden: true });
    const picker = dialogs.find((d) => d !== dialog)!;
    fireEvent.keyDown(picker, { key: "ArrowRight" });

    expect(screen.queryByRole("dialog", { name: "Zoo", hidden: true })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { hidden: true })).toHaveTextContent("Alpha");
  });
});
