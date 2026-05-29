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
const STORAGE_KEY = `decklist:view-options:${DECK_ID}`;

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

async function openViewOptions(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole("button", { name: /view options/i });
  trigger.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("menuitemcheckbox", { name: /mana values/i });
}

describe("DecklistToolbar — View options menu", () => {
  it("renders the View options trigger", () => {
    render(
      <DecklistToolbar
        deckId={DECK_ID}
        deckFormat="COMMANDER"
        isOwner={true}
        initialBulkEditText=""
        colorIdentity={[]}
        pips={{ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }}
        currentLandCount={0}
        viewerId="user-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /view options/i }),
    ).toBeInTheDocument();
  });

  it("omits the Ownership option when viewerId is undefined", async () => {
    const user = userEvent.setup();
    render(
      <DecklistToolbar
        deckId={DECK_ID}
        deckFormat="COMMANDER"
        isOwner={false}
        initialBulkEditText=""
        colorIdentity={[]}
        pips={{ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }}
        currentLandCount={0}
      />,
    );

    await openViewOptions(user);

    expect(
      screen.getByRole("menuitemcheckbox", { name: /mana values/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /^price$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /ownership/i }),
    ).toBeNull();
  });

  it("toggling Ownership persists to localStorage", async () => {
    const user = userEvent.setup();
    render(
      <DecklistToolbar
        deckId={DECK_ID}
        deckFormat="COMMANDER"
        isOwner={true}
        initialBulkEditText=""
        colorIdentity={[]}
        pips={{ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }}
        currentLandCount={0}
        viewerId="user-1"
      />,
    );

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    await openViewOptions(user);
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /ownership/i }),
    );

    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).ownership).toBe(true);
  });

  it("defaults: mana values on, price off, ownership off", async () => {
    const user = userEvent.setup();
    render(
      <DecklistToolbar
        deckId={DECK_ID}
        deckFormat="COMMANDER"
        isOwner={true}
        initialBulkEditText=""
        colorIdentity={[]}
        pips={{ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }}
        currentLandCount={0}
        viewerId="user-1"
      />,
    );

    await openViewOptions(user);

    expect(
      screen.getByRole("menuitemcheckbox", { name: /mana values/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemcheckbox", { name: /^price$/i }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("menuitemcheckbox", { name: /ownership/i }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
