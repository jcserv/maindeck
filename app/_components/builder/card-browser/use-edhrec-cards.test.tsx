import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useEdhrecCards } from "./use-edhrec-cards";
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

describe("useEdhrecCards", () => {
  it("fetches suggestions for a slug and exposes results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [card(1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("commander=atraxa");
    expect(result.current.loading).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.count).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("never fetches when there is no slug", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards(null, true));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("never fetches while inactive", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", false));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("clears results when the slug drops away", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: [card(1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string | null }) => useEdhrecCards(slug, true),
      { initialProps: { slug: "atraxa" as string | null } },
    );
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    rerender({ slug: null });
    await waitFor(() => expect(result.current.results).toEqual([]));
    expect(result.current.loading).toBe(false);
  });

  it("backs off on 429 and auto-retries with the spinner restored", async () => {
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

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));

    await waitFor(() =>
      expect(result.current.error).toBe("Too many requests — retrying…"),
    );
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.results).toHaveLength(1), {
      timeout: 3000,
    });
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a dedicated message for a 502 upstream failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: false, status: 502, json: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));

    await waitFor(() =>
      expect(result.current.error).toBe(
        "EDHREC is unavailable right now. Try again shortly.",
      ),
    );
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("surfaces a generic message for a non-429/502 failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: false, status: 500, json: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));

    await waitFor(() =>
      expect(result.current.error).toBe("Couldn't load EDHREC suggestions."),
    );
    expect(result.current.results).toEqual([]);
  });

  it("surfaces a generic error when the request throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));

    await waitFor(() =>
      expect(result.current.error).toBe("Couldn't load EDHREC suggestions."),
    );
    expect(result.current.results).toEqual([]);
  });

  it("swallows abort errors without surfacing them", async () => {
    const fetchMock = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.error).toBeNull();
  });

  it("treats a non-array payload as empty results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockRes({ ok: true, status: 200, json: { oops: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("reveals more rows via showMore and flips hasMore", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockRes({ ok: true, status: 200, json: [...fullPage, card(99)] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEdhrecCards("atraxa", true));
    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.count).toBe(PAGE_SIZE + 1);

    act(() => result.current.showMore());
    await waitFor(() =>
      expect(result.current.results).toHaveLength(PAGE_SIZE + 1),
    );
    expect(result.current.hasMore).toBe(false);
    // Reveal is a pure window slide — no extra network call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a fetch that resolves after the slug changed mid-flight", async () => {
    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((r) => { resolveFirst = r; }),
      )
      .mockResolvedValueOnce(
        mockRes({ ok: true, status: 200, json: [card(500)] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useEdhrecCards(slug, true),
      { initialProps: { slug: "atraxa" } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ slug: "kenrith" });
    await waitFor(() => expect(result.current.results).toEqual([card(500)]));

    // Stale first request resolves last — its rows must not land.
    act(() => resolveFirst(mockRes({ ok: true, status: 200, json: [card(1)] })));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.results).toEqual([card(500)]);
  });

  it("ignores json that resolves after the slug changed mid-flight", async () => {
    // json() for the first request is a controlled promise. After the slug
    // changes (reqId increments), the first json() resolving must be discarded.
    let resolveFirstJson!: (v: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => new Promise((r) => { resolveFirstJson = r; }),
        } as unknown as Response),
      )
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: [card(500)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useEdhrecCards(slug, true),
      { initialProps: { slug: "atraxa" } },
    );
    // Wait for first fetch to fire.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Change slug while first json() is still pending → reqId increments.
    rerender({ slug: "kenrith" });
    await waitFor(() => expect(result.current.results).toEqual([card(500)]));

    // Resolve the first json() — the stale id guard at line 90 must discard it.
    act(() => resolveFirstJson([card(1)]));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.results).toEqual([card(500)]);
  });

  it("discards an abort error that arrives after the slug changed", async () => {
    // The first fetch listens to its AbortSignal and rejects when the cleanup
    // fires. After the slug change reqId is already incremented, so the stale
    // guard at the top of the catch block must short-circuit before reaching
    // the AbortError check on the next line.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, opts: RequestInit) =>
          new Promise<Response>((_, reject) => {
            (opts.signal as AbortSignal).addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }),
      )
      .mockResolvedValueOnce(mockRes({ ok: true, status: 200, json: [card(500)] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useEdhrecCards(slug, true),
      { initialProps: { slug: "atraxa" } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Slug change: old controller is aborted (reqId increments) and new fetch fires.
    rerender({ slug: "kenrith" });
    await waitFor(() => expect(result.current.results).toEqual([card(500)]));

    // No stale error must have leaked.
    expect(result.current.error).toBeNull();
  });

  it("ignores json that resolves after unmount", async () => {
    let resolveJson!: (v: unknown) => void;
    const res = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => new Promise((r) => { resolveJson = r; }),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(res);
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() =>
      useEdhrecCards("atraxa", true),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    unmount();
    resolveJson([card(1)]);
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.results).toEqual([]);
  });
});
