import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { DeckCard } from "@/lib/deck/zone-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/deck/editor-actions", () => ({
  updateCardQuantity: vi.fn().mockResolvedValue(undefined),
  removeCardFromDeck: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/app/_actions/deck/categories", () => ({
  moveCardTo: vi.fn().mockResolvedValue(undefined),
  setCardCategories: vi.fn().mockResolvedValue(undefined),
}));

import { removeCardFromDeck } from "@/lib/deck/editor-actions";
import { setCardCategories } from "@/app/_actions/deck/categories";
import { CardRowSortable } from "./card-row-sortable";

const mockRemoveCard = vi.mocked(removeCardFromDeck);
const mockSetCategories = vi.mocked(setCardCategories);

const DECK_ID = "deck-1";
const PRINTING_ID = 42;

function makeDc(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    id: "dc-1",
    deckId: DECK_ID,
    cardId: 1,
    quantity: 1,
    zone: "MAINBOARD",
    categories: [],
    printingId: PRINTING_ID,
    isFoil: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    card: {
      id: 1,
      name: "Sol Ring",
      mainType: "Artifact",
      typeLine: "Artifact",
      manaCost: null,
      oracleText: null,
      colorIdentity: [],
      gameChanger: false,
      legalities: null,
      printings: [{ id: PRINTING_ID, imageUri: null, backImageUri: null }],
    },
    printing: {
      id: PRINTING_ID,
      setCode: "lea",
      collectorNumber: "270",
      imageUri: null,
      backImageUri: null,
    },
    ...overrides,
  } as unknown as DeckCard;
}

function renderRow(dc: DeckCard) {
  return render(
    <DndContext>
      <SortableContext items={[dc.id]}>
        <ul>
          <CardRowSortable
            dc={dc}
            deckId={DECK_ID}
            format="COMMANDER"
            subcategories={["Ramp", "Removal"]}
            commanderSet={false}
            dispatch={vi.fn()}
            viewerId="user-1"
            viewOptions={{ manaValues: true, price: false, ownership: false }}
          />
        </ul>
      </SortableContext>
    </DndContext>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CardRowSortable ghost rows", () => {
  it("labels a ghost row with its primary category so it is distinguishable", () => {
    const dc = makeDc({
      isSecondary: true,
      categories: ["Ramp", "Removal"],
      sectionCategory: "Removal",
    });
    renderRow(dc);

    expect(screen.getByText(/\(also in Ramp\)/)).toBeInTheDocument();
  });

  it("primary row carries no ghost qualifier", () => {
    renderRow(makeDc({ categories: ["Ramp"] }));

    expect(screen.queryByText(/also in/i)).toBeNull();
  });

  it("ghost Trash strips only the section membership, keeping the card in the deck", async () => {
    const user = userEvent.setup();
    const dc = makeDc({
      isSecondary: true,
      categories: ["Ramp", "Removal"],
      sectionCategory: "Removal",
    });
    renderRow(dc);

    await user.click(
      screen.getByRole("button", { name: /remove sol ring from removal/i }),
    );

    expect(mockSetCategories).toHaveBeenCalledWith(DECK_ID, "dc-1", ["Ramp"]);
    expect(mockRemoveCard).not.toHaveBeenCalled();
  });

  it("primary row Trash deletes the whole card", async () => {
    const user = userEvent.setup();
    renderRow(makeDc({ categories: ["Ramp"] }));

    await user.click(
      screen.getByRole("button", { name: /remove sol ring from deck/i }),
    );

    expect(mockRemoveCard).toHaveBeenCalledWith(DECK_ID, "dc-1");
    expect(mockSetCategories).not.toHaveBeenCalled();
  });

  it.each(["Backspace", "Delete"])(
    "keyboard %s on a ghost row strips only the section membership",
    (key) => {
      const dc = makeDc({
        isSecondary: true,
        categories: ["Ramp", "Removal"],
        sectionCategory: "Removal",
      });
      const { container } = renderRow(dc);

      const row = container.querySelector("[data-deck-row]") as HTMLElement;
      fireEvent.keyDown(row, { key });

      expect(mockSetCategories).toHaveBeenCalledWith(DECK_ID, "dc-1", ["Ramp"]);
      expect(mockRemoveCard).not.toHaveBeenCalled();
    },
  );

  it.each(["Backspace", "Delete"])(
    "keyboard %s on a primary row deletes the whole card",
    (key) => {
      const { container } = renderRow(makeDc({ categories: ["Ramp"] }));

      const row = container.querySelector("[data-deck-row]") as HTMLElement;
      fireEvent.keyDown(row, { key });

      expect(mockRemoveCard).toHaveBeenCalledWith(DECK_ID, "dc-1");
      expect(mockSetCategories).not.toHaveBeenCalled();
    },
  );
});
