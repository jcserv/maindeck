import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(),
}));

import { getRedis } from "@/lib/redis";
import { getOrSet, invalidate } from "../cache";

const mockGetRedis = vi.mocked(getRedis);

function makeClient() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getOrSet", () => {
  it("returns cached value and skips the loader on a hit", async () => {
    const client = makeClient();
    client.get.mockResolvedValue(JSON.stringify({ hello: "world" }));
    mockGetRedis.mockResolvedValue(client as never);
    const loader = vi.fn();

    const result = await getOrSet("k", 60, loader);

    expect(result).toEqual({ hello: "world" });
    expect(loader).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
  });

  it("calls the loader on miss and writes the result with the configured TTL", async () => {
    const client = makeClient();
    client.get.mockResolvedValue(null);
    mockGetRedis.mockResolvedValue(client as never);

    const result = await getOrSet("k", 90, async () => ({ fresh: true }));

    expect(result).toEqual({ fresh: true });
    expect(client.set).toHaveBeenCalledWith(
      "k",
      JSON.stringify({ fresh: true }),
      "EX",
      90,
    );
  });

  it("degrades to the loader when Redis is unavailable", async () => {
    mockGetRedis.mockResolvedValue(null);
    const loader = vi.fn(async () => "from-db");

    const result = await getOrSet("k", 30, loader);

    expect(result).toBe("from-db");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("falls through to the loader when redis.get throws", async () => {
    const client = makeClient();
    client.get.mockRejectedValue(new Error("ECONNRESET"));
    mockGetRedis.mockResolvedValue(client as never);

    const result = await getOrSet("k", 60, async () => "from-db");

    expect(result).toBe("from-db");
  });

  it("does not cache null or undefined loader results", async () => {
    const client = makeClient();
    client.get.mockResolvedValue(null);
    mockGetRedis.mockResolvedValue(client as never);

    await getOrSet("k-null", 60, async () => null);
    await getOrSet("k-undef", 60, async () => undefined);

    expect(client.set).not.toHaveBeenCalled();
  });

  it("still returns the loader value when the background write fails", async () => {
    const client = makeClient();
    client.get.mockResolvedValue(null);
    client.set.mockRejectedValue(new Error("boom"));
    mockGetRedis.mockResolvedValue(client as never);

    const result = await getOrSet("k", 60, async () => "ok");

    expect(result).toBe("ok");
  });
});

describe("invalidate", () => {
  it("deletes the given keys", async () => {
    const client = makeClient();
    mockGetRedis.mockResolvedValue(client as never);

    await invalidate("a", "b", "c");

    expect(client.del).toHaveBeenCalledWith("a", "b", "c");
  });

  it("is a no-op when no keys are provided", async () => {
    await invalidate();
    expect(mockGetRedis).not.toHaveBeenCalled();
  });

  it("is a no-op when Redis is unavailable", async () => {
    mockGetRedis.mockResolvedValue(null);
    await expect(invalidate("k")).resolves.toBeUndefined();
  });

  it("swallows errors from redis.del", async () => {
    const client = makeClient();
    client.del.mockRejectedValue(new Error("nope"));
    mockGetRedis.mockResolvedValue(client as never);

    await expect(invalidate("k")).resolves.toBeUndefined();
  });
});
