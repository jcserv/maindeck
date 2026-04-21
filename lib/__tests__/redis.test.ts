import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ioredisCtor } = vi.hoisted(() => ({
  ioredisCtor: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: ioredisCtor,
}));

import { __resetRedisForTests, getRedis } from "../redis";

beforeEach(() => {
  __resetRedisForTests();
  ioredisCtor.mockReset();
  ioredisCtor.mockImplementation(function stub(this: unknown) {
    return this;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRedis", () => {
  it("returns null when REDIS_URL is unset", async () => {
    vi.stubEnv("REDIS_URL", "");
    const client = await getRedis();
    expect(client).toBeNull();
    expect(ioredisCtor).not.toHaveBeenCalled();
  });

  it("instantiates ioredis with structured options parsed from REDIS_URL", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    await getRedis();
    expect(ioredisCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "localhost",
        port: 6379,
        enableOfflineQueue: false,
      }),
    );
  });

  it("caches the client across calls", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    const first = await getRedis();
    const second = await getRedis();
    expect(first).toBe(second);
    expect(ioredisCtor).toHaveBeenCalledTimes(1);
  });
});
