import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
}));

import { SimpleBar } from "./simple-bar";
import { HeaderSearchProvider } from "./header-search-context";
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

/**
 * SimpleBar fetches the viewer's decks from `/api/decks/mine` on mount. Route
 * every fetch except the card search to an empty deck list so each test only
 * has to script the `/api/cards/search` responses it cares about.
 */
function installFetch(search: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn((url: string) => {
    if (String(url).includes("/api/cards/search")) return search(url);
    return Promise.resolve(mockRes({ ok: true, status: 200, json: { decks: [] } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderBar() {
  return render(
    <HeaderSearchProvider>
      <SimpleBar />
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
// are unit-tested in use-card-search.test.tsx. These cover the homepage-bar
// wiring: that hook results/error reach this surface.
describe("SimpleBar search", () => {
  it("renders hook results in the cards list", async () => {
    const search = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [CARD] }));
    installFetch(search);
    const user = userEvent.setup();
    renderBar();

    await user.type(getInput(), "bo");

    expect(await screen.findByText("Lightning Bolt")).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
    expect(String(search.mock.calls[0]?.[0])).toContain("q=bo");
  });

  it("shows a retry message on 429 then auto-recovers without retyping", async () => {
    const search = vi
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
    installFetch(search);
    const user = userEvent.setup();
    renderBar();

    await user.type(getInput(), "bolt");

    expect(await screen.findByText(RETRY_MESSAGE)).toBeInTheDocument();
    expect(
      await screen.findByText("Lightning Bolt", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(RETRY_MESSAGE)).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(2);
  });
});
