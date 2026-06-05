import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeckCard } from "@/lib/deck/zone-view";
import type { OwnershipResolution } from "@/lib/inventory/state";

vi.mock("@/app/_actions/inventory", () => ({
  setHolding: vi.fn().mockResolvedValue(undefined),
  setWishlist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { setHolding, setWishlist } from "@/app/_actions/inventory";
import { CardRow } from "./card-row";

const mockSetHolding = vi.mocked(setHolding);
const mockSetWishlist = vi.mocked(setWishlist);

const DECK_ID = "deck-1";
const PRINTING_ID = 42;

function makeDc(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    id: "dc-1",
    deckId: DECK_ID,
    cardId: 1,
    quantity: 1,
    zone: "MAINBOARD",
    category: null,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CardRow ownership badge", () => {
  it("renders OWNED badge when ownership is OWNED and viewOptions.ownership+viewerId set", () => {
    const ownership: OwnershipResolution = { state: "OWNED" };
    render(
      <ul>
        <CardRow
          dc={makeDc()}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={true}
          dispatch={vi.fn()}
          viewerId="user-1"
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: true }}
        />
      </ul>,
    );
    expect(screen.getByLabelText(/^owned/i)).toBeInTheDocument();
  });

  it("hides badge when viewOptions.ownership is false", () => {
    const ownership: OwnershipResolution = { state: "OWNED" };
    render(
      <ul>
        <CardRow
          dc={makeDc()}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={true}
          dispatch={vi.fn()}
          viewerId="user-1"
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: false }}
        />
      </ul>,
    );
    expect(screen.queryByLabelText(/^owned/i)).toBeNull();
  });

  it("hides badge for signed-out viewer (viewerId undefined)", () => {
    const ownership: OwnershipResolution = { state: "OWNED" };
    render(
      <ul>
        <CardRow
          dc={makeDc()}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={false}
          dispatch={vi.fn()}
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: true }}
        />
      </ul>,
    );
    expect(screen.queryByLabelText(/^owned/i)).toBeNull();
  });

  it("renders NOT_OWNED badge so users can mark unowned cards", () => {
    const ownership: OwnershipResolution = { state: "NOT_OWNED" };
    render(
      <ul>
        <CardRow
          dc={makeDc()}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={true}
          dispatch={vi.fn()}
          viewerId="user-1"
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: true }}
        />
      </ul>,
    );
    expect(screen.getByLabelText(/not owned/i)).toBeInTheDocument();
  });
});

describe("CardRow inventory menu", () => {
  it("opens via right-click and fires setHolding when 'Mark as owned' is chosen", async () => {
    const user = userEvent.setup();
    const ownership: OwnershipResolution = { state: "NOT_OWNED" };
    render(
      <ul>
        <CardRow
          dc={makeDc()}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={true}
          dispatch={vi.fn()}
          viewerId="user-1"
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: true }}
        />
      </ul>,
    );

    const row = screen.getByText("Sol Ring").closest("li")!;
    await user.pointer({ keys: "[MouseRight]", target: row });

    const menuItem = await screen.findByRole("menuitem", {
      name: /mark as owned/i,
    });
    await user.click(menuItem);

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, false, 1);
  });

  it("fires setWishlist when 'Mark as wishlist' is chosen", async () => {
    const user = userEvent.setup();
    const ownership: OwnershipResolution = { state: "NOT_OWNED" };
    render(
      <ul>
        <CardRow
          dc={makeDc({ isFoil: true })}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={true}
          dispatch={vi.fn()}
          viewerId="user-1"
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: true }}
        />
      </ul>,
    );

    const row = screen.getByText("Sol Ring").closest("li")!;
    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(
      await screen.findByRole("menuitem", { name: /mark as wishlist/i }),
    );

    expect(mockSetWishlist).toHaveBeenCalledWith(PRINTING_ID, true, true);
  });

  it("fires both clear actions when 'Clear ownership' is chosen", async () => {
    const user = userEvent.setup();
    const ownership: OwnershipResolution = { state: "OWNED" };
    render(
      <ul>
        <CardRow
          dc={makeDc()}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={true}
          dispatch={vi.fn()}
          viewerId="user-1"
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: true }}
        />
      </ul>,
    );

    const row = screen.getByText("Sol Ring").closest("li")!;
    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(
      await screen.findByRole("menuitem", { name: /clear ownership/i }),
    );

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, false, 0);
    expect(mockSetWishlist).toHaveBeenCalledWith(PRINTING_ID, false, false);
  });

  it("signed-out viewer (no viewerId) sees no menu on right-click", async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <CardRow
          dc={makeDc()}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={false}
          dispatch={vi.fn()}
        />
      </ul>,
    );

    const row = screen.getByText("Sol Ring").closest("li")!;
    await user.pointer({ keys: "[MouseRight]", target: row });

    expect(
      screen.queryByRole("menuitem", { name: /mark as owned/i }),
    ).toBeNull();
  });

  it("uses canonical first printing id when DeckCard has no pinned printing", async () => {
    const user = userEvent.setup();
    const dc = makeDc({
      printingId: null,
      printing: null,
    });
    const ownership: OwnershipResolution = { state: "NOT_OWNED" };
    render(
      <ul>
        <CardRow
          dc={dc}
          deckId={DECK_ID}
          format="COMMANDER"
          subcategories={[]}
          isOwner={true}
          dispatch={vi.fn()}
          viewerId="user-1"
          ownership={ownership}
          viewOptions={{ manaValues: true, price: false, ownership: true }}
        />
      </ul>,
    );

    const row = screen.getByText("Sol Ring").closest("li")!;
    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(
      await screen.findByRole("menuitem", { name: /mark as owned.*default/i }),
    );

    expect(mockSetHolding).toHaveBeenCalledWith(PRINTING_ID, false, 1);
  });
});
