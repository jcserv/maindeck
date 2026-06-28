import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit/redis", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit/request", () => ({ getClientIp: vi.fn(() => "1.2.3.4") }));
vi.mock("@/lib/edhrec/recommendations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/edhrec/recommendations")>(
    "@/lib/edhrec/recommendations",
  );
  return { ...actual, getEdhrecSuggestions: vi.fn() };
});

import { GET } from "./route";
import { rateLimit } from "@/lib/rate-limit/redis";
import {
  EdhrecUnavailableError,
  getEdhrecSuggestions,
} from "@/lib/edhrec/recommendations";

const rateLimitMock = vi.mocked(rateLimit);
const suggestMock = vi.mocked(getEdhrecSuggestions);

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function allow() {
  rateLimitMock.mockResolvedValue({
    success: true,
    limit: 60,
    remaining: 59,
    resetSeconds: 60,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cards/edhrec", () => {
  it("returns 429 with rate-limit headers when denied", async () => {
    rateLimitMock.mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      resetSeconds: 9,
    });

    const res = await GET(req("/api/cards/edhrec?commander=norin-the-wary"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("9");
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing commander slug", async () => {
    allow();
    const res = await GET(req("/api/cards/edhrec"));
    expect(res.status).toBe(400);
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a slug with illegal characters", async () => {
    allow();
    const res = await GET(req("/api/cards/edhrec?commander=norin_the_wary!"));
    expect(res.status).toBe(400);
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it("returns suggestions for a valid slug", async () => {
    allow();
    const suggestions = [{ id: 1, name: "Lightning Bolt", synergy: 0.4, inclusion: 9 }];
    suggestMock.mockResolvedValue(
      suggestions as unknown as Awaited<ReturnType<typeof getEdhrecSuggestions>>,
    );

    const res = await GET(req("/api/cards/edhrec?commander=norin-the-wary"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(suggestions);
    expect(suggestMock).toHaveBeenCalledWith("norin-the-wary");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("accepts a partner-pair slug", async () => {
    allow();
    suggestMock.mockResolvedValue([]);

    const res = await GET(
      req("/api/cards/edhrec?commander=tana-the-bloodsower-tymna-the-weaver"),
    );

    expect(res.status).toBe(200);
    expect(suggestMock).toHaveBeenCalledWith(
      "tana-the-bloodsower-tymna-the-weaver",
    );
  });

  it("translates an upstream failure to 502", async () => {
    allow();
    suggestMock.mockRejectedValue(new EdhrecUnavailableError("timeout"));

    const res = await GET(req("/api/cards/edhrec?commander=norin-the-wary"));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/EDHREC/);
  });
});
