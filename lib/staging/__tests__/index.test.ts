import { beforeEach, describe, expect, it, vi } from "vitest";
import { VercelBlobStorage } from "../blob";
import { getBatchStorage } from "../index";
import { LocalFsStorage } from "../local";

describe("getBatchStorage", () => {
  beforeEach(() => {
    vi.stubEnv("STAGING_DRIVER", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  });

  it("returns LocalFsStorage when STAGING_DRIVER=local", () => {
    vi.stubEnv("STAGING_DRIVER", "local");
    expect(getBatchStorage()).toBeInstanceOf(LocalFsStorage);
  });

  it("returns VercelBlobStorage when STAGING_DRIVER=blob and token is set", () => {
    vi.stubEnv("STAGING_DRIVER", "blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    expect(getBatchStorage()).toBeInstanceOf(VercelBlobStorage);
  });

  it("throws a clear error when STAGING_DRIVER=blob and token is missing", () => {
    vi.stubEnv("STAGING_DRIVER", "blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(() => getBatchStorage()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  it("defaults to VercelBlobStorage when VERCEL=1 and token is set", () => {
    vi.stubEnv("STAGING_DRIVER", undefined);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    expect(getBatchStorage()).toBeInstanceOf(VercelBlobStorage);
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
