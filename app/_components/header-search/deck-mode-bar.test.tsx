import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/deck/editor-actions", () => ({ addCardToDeck: vi.fn() }));
vi.mock("@/app/_actions/deck/categories", () => ({ createCategory: vi.fn() }));

import { DeckModeBar } from "./deck-mode-bar";
import { HeaderSearchProvider } from "./header-search-context";
import { DeckSearchProvider } from "@/app/_components/builder/deck-search-context";
import type { CardSearchResult } from "@/lib/search/card-search";

const RETRY_MESSAGE = "Too many searches — retrying…";

const CARD: CardSearchResult = {
  id: 1,
  name: "Lightning Bolt",
  mainType: "INSTANT" as CardSearchResult["mainType"],
  typeLine: "Instant",
  manaCost: "{R}",
  imageUri: "https://example.test/bolt.png",
  legalities: {} as CardSearchResult["legalities"],
  gameChanger: false,
  colorIdentity: ["R"],
};

function mockRes(opts: {
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  json: unknown;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: { get: (k: string) => opts.headers?.[k] ?? null },
    json: async () => opts.json,
  } as unknown as Response;
}

function renderBar(isOwner = true) {
  return render(
    <HeaderSearchProvider>
      <DeckSearchProvider>
        <DeckModeBar deckRoute={{ deckId: "d1", isOwner }} />
      </DeckSearchProvider>
    </HeaderSearchProvider>,
  );
}

function getInput() {
  return screen.getByRole("searchbox", { name: /search cards/i });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Debounce, the min-length gate, and 429 back-off live in `useCardSearch` and
// are unit-tested in use-card-search.test.tsx. These cover the deck-bar wiring:
// that hook results/error reach this surface.
describe("DeckModeBar search", () => {
  it("renders hook results in the add-card list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [CARD] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBar();

    await user.type(getInput(), "bo");

    expect(await screen.findByText("Lightning Bolt")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("q=bo");
  });

  it("shows a retry message on 429 then auto-recovers without retyping", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockRes({
          ok: false,
          status: 429,
          headers: { "Retry-After": "1" },
          json: { error: "Too many requests" },
        }),
      )
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: [CARD] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBar();

    await user.type(getInput(), "bolt");

    expect(await screen.findByText(RETRY_MESSAGE)).toBeInTheDocument();

    // Retry-After: 1s — the effect re-fires on its own and recovers.
    expect(
      await screen.findByText("Lightning Bolt", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(RETRY_MESSAGE)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
