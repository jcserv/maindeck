import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useCardSearch } from "./use-card-search";
import type { CardSearchResult } from "@/lib/search/card-search";

const CARD = { id: 1, name: "Lightning Bolt" } as unknown as CardSearchResult;

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

describe("useCardSearch", () => {
  it("debounces, fetches, and exposes results for a 2+ char term", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [CARD] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardSearch("bolt"));

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("q=bolt");
    expect(result.current.term).toBe("bolt");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch for terms below the min length", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardSearch("b"));
    await new Promise((r) => setTimeout(r, 400));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.term).toBe("");
    expect(result.current.results).toEqual([]);
  });

  it("clears results when the term drops back below the gate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [CARD] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useCardSearch(q),
      { initialProps: { q: "bolt" } },
    );
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    rerender({ q: "" });
    await waitFor(() => expect(result.current.results).toEqual([]));
    expect(result.current.term).toBe("");
  });

  it("stays idle when disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useCardSearch("bolt", { enabled: false }));
    await new Promise((r) => setTimeout(r, 400));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("backs off on 429 and auto-retries the same term", async () => {
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

    const { result } = renderHook(() => useCardSearch("bolt"));

    await waitFor(() =>
      expect(result.current.error).toBe("Too many searches — retrying…"),
    );
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

    const { result } = renderHook(() => useCardSearch("bolt"));

    await waitFor(() =>
      expect(result.current.error).toBe("Search failed. Try again."),
    );
    expect(result.current.results).toEqual([]);
  });

  it("surfaces a generic error when the request throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardSearch("bolt"));

    await waitFor(() =>
      expect(result.current.error).toBe("Search failed. Try again."),
    );
  });

  it("treats a non-array JSON payload as empty results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: { oops: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardSearch("bolt"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
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

    const { unmount } = renderHook(() => useCardSearch("bolt"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Cleanup flips the cancelled guard before the fetch settles.
    unmount();
    resolveFetch(mockRes({ ok: true, status: 200, json: [CARD] }));
    await new Promise((r) => setTimeout(r, 0));
    // No state update / throw — the post-fetch cancelled guard short-circuits.
  });

  it("ignores a JSON body that resolves after unmount", async () => {
    let resolveJson!: (v: unknown) => void;
    const res = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => new Promise((r) => { resolveJson = r; }),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(res);
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderHook(() => useCardSearch("bolt"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Let the fetch resolve (passes the first guard), then unmount while json() pends.
    await new Promise((r) => setTimeout(r, 0));
    unmount();
    resolveJson([CARD]);
    await new Promise((r) => setTimeout(r, 0));
    // The post-json cancelled guard short-circuits — no state update.
  });

  it("ignores a fetch that rejects after unmount", async () => {
    let rejectFetch!: (e: unknown) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((_, rej) => { rejectFetch = rej; }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useCardSearch("bolt"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    unmount();
    rejectFetch(new Error("late failure"));
    await new Promise((r) => setTimeout(r, 0));
    // The catch-block cancelled guard short-circuits before surfacing an error.
    expect(result.current.error).toBeNull();
  });

  it("swallows abort errors without surfacing them", async () => {
    const fetchMock = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCardSearch("bolt"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Give the rejected promise a tick to settle, then confirm it stayed quiet.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.error).toBeNull();
  });
});
