import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWithRetry", () => {
  it("returns the first OK response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await fetchWithRetry("https://x.example", undefined, {
      baseMs: 1,
      jitterMs: 0,
    });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and succeeds", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await fetchWithRetry("https://x.example", undefined, {
      retries: 3,
      baseMs: 1,
      jitterMs: 0,
    });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx by default", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));
    const res = await fetchWithRetry("https://x.example", undefined, {
      retries: 3,
      baseMs: 1,
      jitterMs: 0,
    });
    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on network errors and surfaces final error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      fetchWithRetry("https://x.example", undefined, {
        retries: 2,
        baseMs: 1,
        jitterMs: 0,
      }),
    ).rejects.toThrow("ECONNRESET");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries on persistent 5xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 500 }));
    await expect(
      fetchWithRetry("https://x.example", undefined, {
        retries: 2,
        baseMs: 1,
        jitterMs: 0,
      }),
    ).rejects.toThrow(/500/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("respects a custom shouldRetry predicate", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await fetchWithRetry("https://x.example", undefined, {
      retries: 2,
      baseMs: 1,
      jitterMs: 0,
      shouldRetry: (r) => r.status === 429,
    });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
