import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/telemetry", () => ({ logWarn: vi.fn() }));
vi.mock("@/lib/search/card-search", () => ({ findCardsByNames: vi.fn() }));

import type { CardSearchResult } from "@/lib/search/card-search";
import { findCardsByNames } from "@/lib/search/card-search";
import {
  EdhrecUnavailableError,
  getEdhrecSuggestions,
} from "../recommendations";

const findMock = vi.mocked(findCardsByNames);

function card(id: number, name: string): CardSearchResult {
  return {
    id,
    name,
    mainType: "Creature",
    typeLine: "Creature",
    manaCost: "{R}",
    imageUri: `${id}.jpg`,
    legalities: {},
    gameChanger: false,
    colorIdentity: ["R"],
  };
}

/** Minimal EDHREC page shape: container.json_dict.cardlists[].cardviews[]. */
function page(cardviews: Array<Record<string, unknown>>) {
  return {
    container: {
      json_dict: {
        cardlists: [{ header: "High Synergy Cards", cardviews }],
      },
    },
  };
}

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: init.status ?? (ok ? 200 : 500),
      json: async () => body,
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getEdhrecSuggestions", () => {
  it("maps EDHREC names to local cards preserving ranking order", async () => {
    mockFetchOnce(
      page([
        { name: "Lightning Bolt", synergy: 0.42, inclusion: 100 },
        { name: "Goblin Welder", synergy: 0.3, inclusion: 80 },
      ]),
    );
    // findCardsByNames returns local rows; suggestions inherit its order.
    findMock.mockResolvedValue([card(1, "Lightning Bolt"), card(2, "Goblin Welder")]);

    const out = await getEdhrecSuggestions("norin-the-wary");

    expect(findMock).toHaveBeenCalledWith(["Lightning Bolt", "Goblin Welder"]);
    expect(out.map((c) => c.name)).toEqual(["Lightning Bolt", "Goblin Welder"]);
    expect(out[0]).toMatchObject({ synergy: 0.42, inclusion: 100 });
    expect(out[1]).toMatchObject({ synergy: 0.3, inclusion: 80 });
  });

  it("dedupes names that appear across cardlists, keeping the first ranking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          container: {
            json_dict: {
              cardlists: [
                { cardviews: [{ name: "Sol Ring", synergy: 0.9, inclusion: 500 }] },
                { cardviews: [{ name: "Sol Ring", synergy: 0.1, inclusion: 10 }] },
              ],
            },
          },
        }),
      })),
    );
    findMock.mockResolvedValue([card(3, "Sol Ring")]);

    const out = await getEdhrecSuggestions("some-commander");

    expect(findMock).toHaveBeenCalledWith(["Sol Ring"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ synergy: 0.9, inclusion: 500 });
  });

  it("returns an empty list (no DB call) when the page has no cardlists", async () => {
    mockFetchOnce({ container: { json_dict: {} } });

    const out = await getEdhrecSuggestions("unknown");

    expect(out).toEqual([]);
    expect(findMock).not.toHaveBeenCalled();
  });

  it("drops names with no local card row", async () => {
    mockFetchOnce(
      page([
        { name: "Real Card", synergy: 0.5, inclusion: 50 },
        { name: "Uningested Card", synergy: 0.4, inclusion: 40 },
      ]),
    );
    // Only the first name resolves locally.
    findMock.mockResolvedValue([card(7, "Real Card")]);

    const out = await getEdhrecSuggestions("c");

    expect(out.map((c) => c.name)).toEqual(["Real Card"]);
  });

  it("throws EdhrecUnavailableError on a non-2xx upstream response", async () => {
    mockFetchOnce({}, { ok: false, status: 404 });

    await expect(getEdhrecSuggestions("missing")).rejects.toBeInstanceOf(
      EdhrecUnavailableError,
    );
    expect(findMock).not.toHaveBeenCalled();
  });

  it("throws EdhrecUnavailableError when the fetch rejects (network/timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }),
    );

    await expect(getEdhrecSuggestions("slow")).rejects.toBeInstanceOf(
      EdhrecUnavailableError,
    );
  });
});
