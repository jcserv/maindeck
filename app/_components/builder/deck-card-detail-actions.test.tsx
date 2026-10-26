import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReducer } from "react";
import { render, screen, within } from "@testing-library/react";
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
import { setCardCategories } from "@/app/_actions/deck/categories";
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

function OwnerBuilder({ initial }: { initial: DeckCard[] }) {
  const [cards, dispatch] = useReducer(applyZoneOptimistic, initial);
  const deck = makeDeck();
  return (
    <DeckPreviewProvider
      renderDetailActions={(previewCard) => (
        <DeckCardDetailActions
          previewCard={previewCard}
          deckId={DECK_ID}
          cards={cards}
          subcategories={CATEGORIES}
          dispatch={dispatch}
          ownershipOf={() => "NOT_OWNED"}
        />
      )}
    >
      <DndContext>
        <DecklistDnd
          deck={deck}
          cards={cards}
          dispatch={dispatch}
          isOwner
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("card detail modal actions", () => {
  const cards = [mainboardCard("dc-zoo", "Zoo"), mainboardCard("dc-alpha", "Alpha")];

  it("assigns a category from the modal and reflects it without closing", async () => {
    render(<OwnerBuilder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    await user.click(within(dialog).getByRole("tab", { name: "Category" }));
    await user.click(within(dialog).getByRole("button", { name: "Ramp" }));

    expect(setCardCategories).toHaveBeenCalledWith(DECK_ID, "dc-alpha", ["ramp"]);
    const open = screen.getByRole("dialog", { name: "Alpha" });
    expect(await within(open).findByLabelText("Primary category")).toBeInTheDocument();
  });

  it("targets the paged-to card after cycling", async () => {
    render(<OwnerBuilder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    await user.click(within(dialog).getByRole("button", { name: /next card/i }));
    const zoo = screen.getByRole("dialog", { name: "Zoo" });
    await user.click(within(zoo).getByRole("tab", { name: "Category" }));
    await user.click(within(zoo).getByRole("button", { name: "Removal" }));

    expect(setCardCategories).toHaveBeenCalledWith(DECK_ID, "dc-zoo", ["removal"]);
  });

  it("removes the card from the deck and closes the modal", async () => {
    render(<OwnerBuilder initial={cards} />);
    const { user, dialog } = await openDetail("Alpha");

    await user.click(within(dialog).getByRole("button", { name: /remove from deck/i }));

    expect(removeCardFromDeck).toHaveBeenCalledWith(DECK_ID, "dc-alpha");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
  });
});
