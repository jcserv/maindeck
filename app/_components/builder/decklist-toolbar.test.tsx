import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/app/_components/header-search/header-search-context", () => ({
  useHeaderSearch: () => ({ focus: vi.fn() }),
}));

vi.mock("@/app/_actions/deck/categories", () => ({
  autogenerateCategories: vi.fn().mockResolvedValue(undefined),
}));

import { DecklistToolbar } from "./decklist-toolbar";

const DECK_ID = "deck-toggle-1";

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("DecklistToolbar — Show/Hide ownership toggle", () => {
  it("renders the Show ownership toggle when viewerId is set", () => {
    render(
      <DecklistToolbar
        deckId={DECK_ID}
        deckFormat="COMMANDER"
        isOwner={true}
        initialBulkEditText=""
        viewerId="user-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /show ownership/i }),
    ).toBeInTheDocument();
  });

  it("hides the toggle entirely when viewerId is undefined (signed-out viewer)", () => {
    render(
      <DecklistToolbar
        deckId={DECK_ID}
        deckFormat="COMMANDER"
        isOwner={false}
        initialBulkEditText=""
      />,
    );
    expect(
      screen.queryByRole("button", { name: /show ownership/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /hide ownership/i }),
    ).toBeNull();
  });

  it("clicking the toggle persists visibility to localStorage and flips the label", async () => {
    const user = userEvent.setup();
    render(
      <DecklistToolbar
        deckId={DECK_ID}
        deckFormat="COMMANDER"
        isOwner={true}
        initialBulkEditText=""
        viewerId="user-1"
      />,
    );

    const key = `decklist:ownership-visible:${DECK_ID}`;
    expect(window.localStorage.getItem(key)).toBeNull();

    await user.click(screen.getByRole("button", { name: /show ownership/i }));

    const stored = window.localStorage.getItem(key);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({ on: true });
    expect(
      screen.getByRole("button", { name: /hide ownership/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide ownership/i }));
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
