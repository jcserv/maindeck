import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit/redis", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit/request", () => ({ getClientIp: vi.fn(() => "1.2.3.4") }));
vi.mock("@/lib/search/card-search", () => ({ searchCards: vi.fn() }));

import { GET } from "./route";
import { rateLimit } from "@/lib/rate-limit/redis";
import { searchCards } from "@/lib/search/card-search";

const rateLimitMock = vi.mocked(rateLimit);
const searchCardsMock = vi.mocked(searchCards);

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function allow() {
  rateLimitMock.mockResolvedValue({
    success: true,
    limit: 90,
    remaining: 89,
    resetSeconds: 60,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cards/search", () => {
  it("returns 429 with a Retry-After header when the limiter denies the request", async () => {
    rateLimitMock.mockResolvedValue({
      success: false,
      limit: 90,
      remaining: 0,
      resetSeconds: 7,
    });

    const res = await GET(req("/api/cards/search?q=bolt"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("7");
    expect(await res.json()).toEqual({ error: "Too many requests" });
    expect(searchCardsMock).not.toHaveBeenCalled();
  });

  it("gates the limiter on the client IP", async () => {
    allow();
    searchCardsMock.mockResolvedValue([]);

    await GET(req("/api/cards/search?q=bolt"));

    expect(rateLimitMock).toHaveBeenCalledWith("cards-search:1.2.3.4", 90, 60);
  });

  it("returns results and rate-limit headers on success", async () => {
    allow();
    const results = [{ id: 1, name: "Lightning Bolt" }];
    searchCardsMock.mockResolvedValue(
      results as unknown as Awaited<ReturnType<typeof searchCards>>,
    );

    const res = await GET(req("/api/cards/search?q=  bolt  &offset=20"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(results);
    expect(searchCardsMock).toHaveBeenCalledWith("bolt", 10, 20, {
      commanderOnly: false,
    });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("90");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("89");
  });

  it("restricts to commander-eligible cards when commander=1", async () => {
    allow();
    searchCardsMock.mockResolvedValue([]);

    await GET(req("/api/cards/search?q=atraxa&commander=1"));

    expect(searchCardsMock).toHaveBeenCalledWith("atraxa", 10, 0, {
      commanderOnly: true,
    });
  });

  it("returns 400 for a missing query", async () => {
    allow();

    const res = await GET(req("/api/cards/search"));

    expect(res.status).toBe(400);
    expect(searchCardsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a blank query", async () => {
    allow();

    const res = await GET(req("/api/cards/search?q=   "));

    expect(res.status).toBe(400);
    expect(searchCardsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the query exceeds the max length", async () => {
    allow();

    const res = await GET(req(`/api/cards/search?q=${"a".repeat(65)}`));

    expect(res.status).toBe(400);
    expect(searchCardsMock).not.toHaveBeenCalled();
  });
});
