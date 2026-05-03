import { describe, expect, it, vi } from "vitest";
import { getEnv } from "../env";

describe("getEnv", () => {
  it("returns parsed values when required vars set", () => {
    vi.stubEnv("DATABASE_URL", "postgres://h/db");
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("STAGING_DRIVER", "local");
    vi.stubEnv("DB_POOL_MAX", "5");
    vi.stubEnv("VERCEL", "");
    const env = getEnv();
    expect(env.DATABASE_URL).toBe("postgres://h/db");
    expect(env.CRON_SECRET).toBe("secret");
    expect(env.STAGING_DRIVER).toBe("local");
    expect(env.DB_POOL_MAX).toBe(5);
    expect(env.IS_VERCEL).toBe(false);
  });

  it("flags VERCEL as true when set", () => {
    vi.stubEnv("VERCEL", "1");
    expect(getEnv().IS_VERCEL).toBe(true);
  });

  it("leaves optional fields undefined when unset", () => {
    vi.stubEnv("STAGING_DRIVER", "");
    vi.stubEnv("DB_POOL_MAX", "");
    const env = getEnv();
    expect(env.STAGING_DRIVER).toBeUndefined();
    expect(env.DB_POOL_MAX).toBeUndefined();
  });

  it("throws when DATABASE_URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getEnv()).toThrow(/DATABASE_URL is required/);
  });

  it("throws when CRON_SECRET is missing", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(() => getEnv()).toThrow(/CRON_SECRET is required/);
  });

  it("throws when BETTER_AUTH_SECRET is missing", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(() => getEnv()).toThrow(/BETTER_AUTH_SECRET is required/);
  });

  it("throws on invalid STAGING_DRIVER value", () => {
    vi.stubEnv("STAGING_DRIVER", "weird");
    expect(() => getEnv()).toThrow(/STAGING_DRIVER must be/);
  });

  it("throws on invalid DB_POOL_MAX value", () => {
    vi.stubEnv("DB_POOL_MAX", "abc");
    expect(() => getEnv()).toThrow(/DB_POOL_MAX must be a positive integer/);
  });

  it("throws on zero/negative DB_POOL_MAX", () => {
    vi.stubEnv("DB_POOL_MAX", "0");
    expect(() => getEnv()).toThrow(/DB_POOL_MAX must be a positive integer/);
  });

  it("returns the explicit BETTER_AUTH_URL when set", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.com");
    expect(getEnv().BETTER_AUTH_URL).toBe("https://auth.example.com");
  });

  it("defaults BETTER_AUTH_URL to localhost when empty", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(getEnv().BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("returns the explicit BLOB_READ_WRITE_TOKEN when set", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "tok_123");
    expect(getEnv().BLOB_READ_WRITE_TOKEN).toBe("tok_123");
  });
});
