import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit/redis", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit/request", () => ({ getClientIp: vi.fn(() => "1.2.3.4") }));
vi.mock("@/lib/search/card-search", () => ({ searchCardsBySyntax: vi.fn() }));

import { GET } from "./route";
import { rateLimit } from "@/lib/rate-limit/redis";
import { searchCardsBySyntax } from "@/lib/search/card-search";

const rateLimitMock = vi.mocked(rateLimit);
const searchMock = vi.mocked(searchCardsBySyntax);

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

describe("GET /api/cards/browse", () => {
  it("returns 429 with rate-limit headers when denied", async () => {
    rateLimitMock.mockResolvedValue({
      success: false,
      limit: 90,
      remaining: 0,
      resetSeconds: 7,
    });

    const res = await GET(req("/api/cards/browse?q=c:U"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("7");
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns an empty array for a missing query without hitting the table", async () => {
    allow();

    const res = await GET(req("/api/cards/browse"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("89");
  });

  it("returns an empty array for a whitespace query", async () => {
    allow();

    const res = await GET(req("/api/cards/browse?q=%20%20"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("parses the syntax and returns results with pagination", async () => {
    allow();
    const results = [{ id: 1, name: "Counterspell" }];
    searchMock.mockResolvedValue(
      results as unknown as Awaited<ReturnType<typeof searchCardsBySyntax>>,
    );

    const res = await GET(req("/api/cards/browse?q=c%3AU+t%3Ainstant&limit=20&offset=40"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(results);
    const [parsed, colors, types, limit, offset] = searchMock.mock.calls[0]!;
    expect(parsed.colors).toEqual(["U"]);
    expect(parsed.typeFragments).toEqual(["instant"]);
    expect(colors).toEqual([]);
    expect(types).toEqual([]);
    expect(limit).toBe(20);
    expect(offset).toBe(40);
  });

  it("returns 400 when the query exceeds the max length", async () => {
    allow();

    const res = await GET(req(`/api/cards/browse?q=${"a".repeat(65)}`));

    expect(res.status).toBe(400);
    expect(searchMock).not.toHaveBeenCalled();
  });
});
