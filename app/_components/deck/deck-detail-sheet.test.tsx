import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import type { Deck, DeckCard } from "@/lib/deck/zone-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  // Sort by name ascending so the rendered/paged order differs from insertion order.
  useSearchParams: () => new URLSearchParams("group=category&sort=name&dir=asc"),
  usePathname: () => "/deck/deck-1",
}));

vi.mock("@/app/_actions/deck/categories", () => ({
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategories: vi.fn(),
  moveCardTo: vi.fn(),
  moveCategoryCards: vi.fn(),
}));

vi.mock("@/app/_components/header-search/header-search-context", () => ({
  useHeaderSearch: () => ({ focus: vi.fn() }),
}));

import { DecklistDnd } from "@/app/_components/builder/decklist-dnd";
import { SideboardConsideringDnd } from "@/app/_components/builder/sideboard-considering-dnd";
import { DeckPreviewProvider } from "./deck-preview-pane";

const DECK_ID = "deck-1";

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
    categories: [],
  } as unknown as Deck;
}

function zoneCard(
  id: string,
  name: string,
  zone: DeckCard["zone"],
): DeckCard {
  return {
    id,
    deckId: DECK_ID,
    cardId: id,
    quantity: 1,
    zone,
    categories: [],
    printingId: null,
    isFoil: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    card: { id, name, mainType: "Creature", printings: [] },
    printing: null,
  } as unknown as DeckCard;
}

function mainboardCard(id: string, name: string): DeckCard {
  return zoneCard(id, name, "MAINBOARD");
}

function consideringCard(id: string, name: string): DeckCard {
  return zoneCard(id, name, "CONSIDERING");
}

function renderBuilder(cards: DeckCard[]) {
  const deck = makeDeck();
  return render(
    <DeckPreviewProvider>
      <DndContext>
        <DecklistDnd
          deck={deck}
          cards={cards}
          dispatch={vi.fn()}
          isOwner
          viewerId="user-1"
          viewerHoldings={[]}
        />
      </DndContext>
    </DeckPreviewProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeckDetailSheet paging", () => {
  // Insertion order: Zoo, Alpha. Sorted asc by name: Alpha, Zoo.
  const cards = [
    mainboardCard("dc-zoo", "Zoo"),
    mainboardCard("dc-alpha", "Alpha"),
  ];

  it("shows paging controls when the deck has multiple cards", async () => {
    const user = userEvent.setup();
    renderBuilder(cards);

    await user.click(screen.getByRole("button", { name: "Alpha" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: /next card/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /previous card/i }),
    ).toBeInTheDocument();
  });

  it("pages through cards in the current sort order, wrapping at the end", async () => {
    const user = userEvent.setup();
    renderBuilder(cards);

    // Open the first card in sort order (Alpha), even though Zoo was inserted first.
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    expect(await screen.findByRole("dialog", { name: "Alpha" })).toBeInTheDocument();

    const next = () =>
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /next card/i,
      });

    // Alpha -> Zoo (sorted order, not insertion order)
    await user.click(next());
    expect(screen.getByRole("dialog", { name: "Zoo" })).toBeInTheDocument();

    // Zoo -> Alpha (wrap-around)
    await user.click(next());
    expect(screen.getByRole("dialog", { name: "Alpha" })).toBeInTheDocument();
  });
});

function renderBuilderWithSideboard(cards: DeckCard[]) {
  const deck = makeDeck();
  return render(
    <DeckPreviewProvider>
      <DndContext>
        <DecklistDnd
          deck={deck}
          cards={cards}
          dispatch={vi.fn()}
          isOwner
          viewerId="user-1"
          viewerHoldings={[]}
        />
        <SideboardConsideringDnd
          deck={deck}
          cards={cards}
          dispatch={vi.fn()}
          isOwner
          viewerId="user-1"
          viewerHoldings={[]}
        />
      </DndContext>
    </DeckPreviewProvider>,
  );
}

describe("DeckDetailSheet paging — considering/sideboard cards", () => {
  // Cards live only in CONSIDERING. Insertion order Counter, Bolt; sorted asc: Bolt, Counter.
  const cards = [
    consideringCard("dc-counter", "Counter"),
    consideringCard("dc-bolt", "Bolt"),
  ];

  it("shows paging controls when opening a Considering card", async () => {
    const user = userEvent.setup();
    renderBuilderWithSideboard(cards);

    await user.click(screen.getByRole("button", { name: "Bolt" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: /next card/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /previous card/i }),
    ).toBeInTheDocument();
  });

  it("pages through Considering cards in sort order, wrapping", async () => {
    const user = userEvent.setup();
    renderBuilderWithSideboard(cards);

    await user.click(screen.getByRole("button", { name: "Bolt" }));
    expect(await screen.findByRole("dialog", { name: "Bolt" })).toBeInTheDocument();

    const next = () =>
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /next card/i,
      });

    // Bolt -> Counter (sorted)
    await user.click(next());
    expect(screen.getByRole("dialog", { name: "Counter" })).toBeInTheDocument();

    // Counter -> Bolt (wrap)
    await user.click(next());
    expect(screen.getByRole("dialog", { name: "Bolt" })).toBeInTheDocument();
  });
});

import { lazy, Suspense } from "react";

describe("DeckDetailSheet paging — async-mounted list (dynamic ssr:false owner path)", () => {
  it("shows paging controls even when the list mounts after the provider/modal", async () => {
    const user = userEvent.setup();
    const deck = makeDeck();
    const cards = [
      mainboardCard("dc-zoo", "Zoo"),
      mainboardCard("dc-alpha", "Alpha"),
    ];

    // Mirror deck-builder.tsx: the list (DecklistDnd) is behind a lazy boundary,
    // while DeckPreviewProvider (and its DeckDetailSheet) mount eagerly.
    const LazyList = lazy(() =>
      Promise.resolve({
        default: () => (
          <DndContext>
            <DecklistDnd
              deck={deck}
              cards={cards}
              dispatch={vi.fn()}
              isOwner
              viewerId="user-1"
              viewerHoldings={[]}
            />
          </DndContext>
        ),
      }),
    );

    render(
      <DeckPreviewProvider>
        <Suspense fallback={<div className="h-[20px]">loading</div>}>
          <LazyList />
        </Suspense>
      </DeckPreviewProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Alpha" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: /next card/i }),
    ).toBeInTheDocument();
  });
});
