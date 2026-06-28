import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The suggestion path crosses a 300ms search debounce plus an async fetch, and
// jsdom under the full suite is slow — give findBy/waitFor generous timeouts so
// these stay deterministic rather than racing the 1000ms default.
const SLOW = { timeout: 4000 } as const;
const TEST_TIMEOUT = 15000;

import { CommanderTypeahead } from "./commander-typeahead";
import type { CardSearchResult } from "@/lib/search/card-search";

const ATRAXA: CardSearchResult = {
  id: 1,
  name: "Atraxa, Praetors' Voice",
  mainType: "CREATURE" as CardSearchResult["mainType"],
  typeLine: "Legendary Creature — Phyrexian Angel Horror",
  manaCost: "{G}{W}{U}{B}",
  imageUri: "https://example.test/atraxa.png",
  legalities: {} as CardSearchResult["legalities"],
  gameChanger: false,
  colorIdentity: ["W", "U", "B", "G"],
};

function mockRes(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => json,
  } as unknown as Response;
}

function installFetch(json: unknown) {
  const fetchMock = vi.fn((..._args: unknown[]) =>
    Promise.resolve(mockRes(json)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function getInput() {
  return screen.getByLabelText("Filter by commander name");
}

/** Focus the field and type a term in one shot (debounce drives the rest). */
function typeQuery(term: string) {
  const input = getInput();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: term } });
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommanderTypeahead", () => {
  it("renders suggestions from the card search endpoint as the user types", async () => {
    const fetchMock = installFetch([ATRAXA]);
    render(<CommanderTypeahead value="" onChange={vi.fn()} />);

    typeQuery("atra");

    expect(await screen.findByRole("option", {}, SLOW)).toHaveTextContent(
      "Atraxa, Praetors' Voice",
    );
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/cards/search?q=atra");
    // Suggestions are scoped to commander-eligible cards.
    expect(url).toContain("commander=1");
  }, TEST_TIMEOUT);

  it("commits the exact card name when a suggestion is picked", async () => {
    installFetch([ATRAXA]);
    const onChange = vi.fn();
    render(<CommanderTypeahead value="" onChange={onChange} />);

    typeQuery("atra");
    fireEvent.click(await screen.findByRole("option", {}, SLOW));

    expect(onChange).toHaveBeenCalledWith("Atraxa, Praetors' Voice");
    // Picking closes the dropdown.
    await waitFor(() =>
      expect(screen.queryByRole("option")).not.toBeInTheDocument(),
    );
  }, TEST_TIMEOUT);

  it("commits free text on a debounce so plaintext search still works", async () => {
    installFetch([]);
    const onChange = vi.fn();
    render(<CommanderTypeahead value="" onChange={onChange} />);

    typeQuery("krenko");

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("krenko"), SLOW);
  }, TEST_TIMEOUT);

  it("does not query for single-character input (debounce/min-length gate)", async () => {
    const fetchMock = installFetch([ATRAXA]);
    render(<CommanderTypeahead value="" onChange={vi.fn()} />);

    typeQuery("a");
    // Give the debounce window time to elapse.
    await new Promise((r) => setTimeout(r, 500));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("re-seeds the input when the committed value changes externally", () => {
    installFetch([]);
    const { rerender } = render(
      <CommanderTypeahead value="krenko" onChange={vi.fn()} />,
    );
    expect(getInput()).toHaveValue("krenko");

    rerender(<CommanderTypeahead value="" onChange={vi.fn()} />);
    expect(getInput()).toHaveValue("");
  });

  it("selects suggestions with the keyboard", async () => {
    installFetch([ATRAXA]);
    const onChange = vi.fn();
    render(<CommanderTypeahead value="" onChange={onChange} />);

    const input = typeQuery("atra");
    await screen.findByRole("option", {}, SLOW);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("Atraxa, Praetors' Voice");
  }, TEST_TIMEOUT);
});
