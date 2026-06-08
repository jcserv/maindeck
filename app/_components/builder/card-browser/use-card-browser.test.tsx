import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useCardBrowser } from "./use-card-browser";
import type { CardSearchResult } from "@/lib/search/card-search";

const PAGE_SIZE = 60;

function card(id: number): CardSearchResult {
  return { id, name: `Card ${id}` } as unknown as CardSearchResult;
}

const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => card(i));

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

function abortError() {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCardBrowser", () => {
  it("debounces, fetches page one, and exposes results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [card(1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("q=bolt");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("offset=0");
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.count).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("never fetches for an empty / whitespace query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("   "));
    await new Promise((r) => setTimeout(r, 400));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("clears results when the query drops back to empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [card(1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useCardBrowser(q),
      { initialProps: { q: "bolt" } },
    );
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    rerender({ q: "" });
    await waitFor(() => expect(result.current.results).toEqual([]));
    expect(result.current.loading).toBe(false);
  });

  it("spins while a newly-typed query debounces in", async () => {
    // Never-resolving fetch keeps the request in flight so the transient
    // loading=true from the render-sync block stays observable.
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useCardBrowser(q),
      { initialProps: { q: "" } },
    );
    expect(result.current.loading).toBe(false);

    rerender({ q: "bolt" });
    // Debounce fires -> render-sync block flips loading true before the fetch.
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("flags hasMore when page one fills PAGE_SIZE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: fullPage }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));

    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE));
    expect(result.current.hasMore).toBe(true);
  });

  it("backs off on 429 and auto-retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockRes({
          ok: false,
          status: 429,
          headers: { "Retry-After": "1" },
          json: {},
        }),
      )
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: [card(1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));

    await waitFor(() =>
      expect(result.current.error).toBe("Too many searches — retrying…"),
    );
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.results).toHaveLength(1), {
      timeout: 3000,
    });
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a generic error for a non-429 failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: false, status: 500, json: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));

    await waitFor(() =>
      expect(result.current.error).toBe("Search failed. Try again."),
    );
    expect(result.current.results).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it("surfaces a generic error when the request throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));

    await waitFor(() =>
      expect(result.current.error).toBe("Search failed. Try again."),
    );
  });

  it("swallows abort errors without surfacing them", async () => {
    const fetchMock = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.error).toBeNull();
  });

  it("treats a non-array payload as empty results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: { oops: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("ignores a fetch that resolves after unmount", async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((r) => { resolveFetch = r; }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderHook(() => useCardBrowser("bolt"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    unmount();
    resolveFetch(mockRes({ ok: true, status: 200, json: [card(1)] }));
    await new Promise((r) => setTimeout(r, 0));
  });

  it("appends a second page via showMore and updates hasMore", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: fullPage }))
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: [card(99)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.showMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.results).toHaveLength(PAGE_SIZE + 1);
    expect(result.current.hasMore).toBe(false);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`offset=${PAGE_SIZE}`);
  });

  it("showMore no-ops when there is no next page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [card(1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    act(() => result.current.showMore());
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("showMore stops paginating when the next page throws", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: fullPage }))
      .mockRejectedValueOnce(new Error("boom"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.showMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.hasMore).toBe(false);
    expect(result.current.results).toHaveLength(PAGE_SIZE);
  });

  it("showMore treats a non-array second page as empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: fullPage }))
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: null }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardBrowser("bolt"));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.showMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.results).toHaveLength(PAGE_SIZE);
    expect(result.current.hasMore).toBe(false);
  });
});
