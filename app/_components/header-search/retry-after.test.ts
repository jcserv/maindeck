import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  MAX_RETRY_AFTER_SECONDS,
  resolveRetryAfterMs,
} from "./retry-after";

describe("resolveRetryAfterMs", () => {
  it("uses a valid positive header value", () => {
    expect(resolveRetryAfterMs("3")).toBe(3000);
  });

  it("accepts fractional seconds", () => {
    expect(resolveRetryAfterMs("1.5")).toBe(1500);
  });

  it("clamps oversized values to the max", () => {
    expect(resolveRetryAfterMs("999")).toBe(MAX_RETRY_AFTER_SECONDS * 1000);
  });

  it("falls back to the default for a missing header", () => {
    expect(resolveRetryAfterMs(null)).toBe(DEFAULT_RETRY_AFTER_SECONDS * 1000);
  });

  it("falls back to the default for a non-numeric header", () => {
    expect(resolveRetryAfterMs("soon")).toBe(DEFAULT_RETRY_AFTER_SECONDS * 1000);
  });

  it("falls back to the default for a zero or negative value", () => {
    expect(resolveRetryAfterMs("0")).toBe(DEFAULT_RETRY_AFTER_SECONDS * 1000);
    expect(resolveRetryAfterMs("-4")).toBe(DEFAULT_RETRY_AFTER_SECONDS * 1000);
  });
});
