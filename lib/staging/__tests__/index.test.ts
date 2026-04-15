import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBatchStorage } from "../index";
import { LocalFsStorage } from "../local";

describe("getBatchStorage", () => {
  beforeEach(() => {
    vi.stubEnv("STAGING_DRIVER", "");
    vi.stubEnv("VERCEL", "");
  });

  it("returns LocalFsStorage when STAGING_DRIVER=local", () => {
    vi.stubEnv("STAGING_DRIVER", "local");
    expect(getBatchStorage()).toBeInstanceOf(LocalFsStorage);
  });

  it("throws a helpful error when STAGING_DRIVER=blob", () => {
    vi.stubEnv("STAGING_DRIVER", "blob");
    expect(() => getBatchStorage()).toThrow(/blob is not implemented/);
  });

  it("throws when STAGING_DRIVER unset and VERCEL=1 (would default to blob)", () => {
    vi.stubEnv("STAGING_DRIVER", undefined);
    vi.stubEnv("VERCEL", "1");
    expect(() => getBatchStorage()).toThrow(/blob is not implemented/);
  });

  it("defaults to LocalFsStorage when both unset", () => {
    vi.stubEnv("STAGING_DRIVER", undefined);
    vi.stubEnv("VERCEL", undefined);
    expect(getBatchStorage()).toBeInstanceOf(LocalFsStorage);
  });

  it("throws for unknown driver values", () => {
    vi.stubEnv("STAGING_DRIVER", "weird");
    expect(() => getBatchStorage()).toThrow("unknown STAGING_DRIVER: weird");
  });
});
