import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { type SerializedDeck } from "@/app/(ui)/decks/explore/actions";

// Mock the server action before importing the component
const loadMorePublicDecksMock = vi.fn();

vi.mock("@/app/(ui)/decks/explore/actions", () => ({
  loadMorePublicDecks: (...args: unknown[]) => loadMorePublicDecksMock(...args),
}));

// DeckCardPreview uses the Link wrapper which calls useRouter() — stub it
// out to avoid needing a full app router context in unit tests.
vi.mock("@/app/_components/decks/deck-card-preview", () => ({
  DeckCardPreview: ({ id, name }: { id: string; name: string }) => (
    <div data-testid={`deck-${id}`}>{name}</div>
  ),
}));

// Capture the IntersectionObserver callback so tests can trigger it manually
type IOCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;
let ioCallback: IOCallback | null = null;
let observeTarget: Element | null = null;
const disconnectMock = vi.fn();

class MockIntersectionObserver {
  constructor(callback: IOCallback) {
    ioCallback = callback;
  }
  observe(el: Element) {
    observeTarget = el;
  }
  disconnect() {
    disconnectMock();
  }
  unobserve = vi.fn();
  root = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

function triggerIntersection(intersecting = true) {
  if (ioCallback && observeTarget) {
    ioCallback(
      [
        {
          isIntersecting: intersecting,
          target: observeTarget,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  }
}

import { ExploreInfiniteList } from "./explore-infinite-list";

function makeDeck(id: string): SerializedDeck {
  return {
    id,
    name: `Deck ${id}`,
    format: "COMMANDER",
    visibility: "PUBLIC",
    cardCount: 99,
    updatedAt: new Date("2024-01-01").toISOString(),
    releasedAt: null,
    previewImages: [],
    isOfficial: false,
    commanderName: null,
  };
}

const filters = {};

beforeEach(() => {
  vi.clearAllMocks();
  ioCallback = null;
  observeTarget = null;
});

describe("ExploreInfiniteList", () => {
  it("renders initial decks", () => {
    const initialDecks = [makeDeck("1"), makeDeck("2"), makeDeck("3")];
    loadMorePublicDecksMock.mockResolvedValue({ decks: [], hasMore: false });

    render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={3}
        pageSize={24}
        filters={filters}
      />,
    );

    expect(screen.getByText("Deck 1")).toBeInTheDocument();
    expect(screen.getByText("Deck 2")).toBeInTheDocument();
    expect(screen.getByText("Deck 3")).toBeInTheDocument();
  });

  it("shows 'No more decks' sentinel when all decks fit on first page", () => {
    const initialDecks = [makeDeck("1")];
    // total === initialDecks.length → hasMore starts as false, no action called

    render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={1}
        pageSize={24}
        filters={filters}
      />,
    );

    expect(screen.getByText(/no more decks/i)).toBeInTheDocument();
    expect(loadMorePublicDecksMock).not.toHaveBeenCalled();
  });

  it("appends next page when sentinel intersects", async () => {
    const initialDecks = [makeDeck("1"), makeDeck("2")];
    const nextPageDecks = [makeDeck("3"), makeDeck("4")];

    loadMorePublicDecksMock.mockResolvedValue({
      decks: nextPageDecks,
      hasMore: false,
    });

    render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={4}
        pageSize={2}
        filters={filters}
      />,
    );

    // Trigger the observer
    triggerIntersection();

    await waitFor(() => {
      expect(screen.getByText("Deck 3")).toBeInTheDocument();
      expect(screen.getByText("Deck 4")).toBeInTheDocument();
    });

    // Original decks are still present
    expect(screen.getByText("Deck 1")).toBeInTheDocument();
    expect(screen.getByText("Deck 2")).toBeInTheDocument();
  });

  it("shows 'No more decks' sentinel after exhausting all pages", async () => {
    const initialDecks = [makeDeck("1")];
    const nextPageDecks = [makeDeck("2")];

    loadMorePublicDecksMock.mockResolvedValue({
      decks: nextPageDecks,
      hasMore: false,
    });

    render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={2}
        pageSize={1}
        filters={filters}
      />,
    );

    triggerIntersection();

    await waitFor(() => {
      expect(screen.getByText(/no more decks/i)).toBeInTheDocument();
    });
  });

  it("calls loadMorePublicDecks with the correct page number", async () => {
    const initialDecks = [makeDeck("1")];
    loadMorePublicDecksMock.mockResolvedValue({ decks: [], hasMore: false });

    render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={2}
        pageSize={1}
        filters={filters}
      />,
    );

    triggerIntersection();

    await waitFor(() => {
      expect(loadMorePublicDecksMock).toHaveBeenCalledWith(filters, 2, 1);
    });
  });

  it("passes filters through to the server action", async () => {
    const filtersWithQ = { q: "dragon", format: "COMMANDER" as const };
    const initialDecks = [makeDeck("1")];
    loadMorePublicDecksMock.mockResolvedValue({ decks: [], hasMore: false });

    render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={2}
        pageSize={1}
        filters={filtersWithQ}
      />,
    );

    triggerIntersection();

    await waitFor(() => {
      expect(loadMorePublicDecksMock).toHaveBeenCalledWith(filtersWithQ, 2, 1);
    });
  });

  it("shows empty state message when no initial decks are provided", () => {
    render(
      <ExploreInfiniteList
        initialDecks={[]}
        total={0}
        pageSize={24}
        filters={filters}
      />,
    );

    expect(
      screen.getByText(/no public decks match your filters/i),
    ).toBeInTheDocument();
  });

  it("does not call the action when sentinel is not intersecting", async () => {
    const initialDecks = [makeDeck("1")];
    loadMorePublicDecksMock.mockResolvedValue({ decks: [], hasMore: false });

    render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={2}
        pageSize={1}
        filters={filters}
      />,
    );

    triggerIntersection(false);

    // Give it a tick to ensure nothing fired
    await new Promise((r) => setTimeout(r, 20));
    expect(loadMorePublicDecksMock).not.toHaveBeenCalled();
  });

  it("disconnects IntersectionObserver on unmount", () => {
    const initialDecks = [makeDeck("1")];

    const { unmount } = render(
      <ExploreInfiniteList
        initialDecks={initialDecks}
        total={1}
        pageSize={24}
        filters={filters}
      />,
    );

    unmount();

    expect(disconnectMock).toHaveBeenCalled();
  });
});
