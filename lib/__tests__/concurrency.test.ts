import { describe, expect, it, vi } from "vitest";
import { runWithConcurrency } from "../concurrency";

describe("runWithConcurrency", () => {
  it("maps over items preserving input order", async () => {
    const out = await runWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it("caps in-flight tasks at the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithConcurrency(Array.from({ length: 8 }, (_, i) => i), 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("floors a fractional concurrency", async () => {
    const fn = vi.fn(async (n: number) => n);
    const out = await runWithConcurrency([1, 2], 2.9, fn);
    expect(out).toEqual([1, 2]);
  });

  it("handles an empty input without invoking fn", async () => {
    const fn = vi.fn(async (n: number) => n);
    expect(await runWithConcurrency([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity, 0.5])(
    "throws RangeError for non-positive-integer concurrency %p",
    async (bad) => {
      await expect(
        runWithConcurrency([1], bad, async (n) => n),
      ).rejects.toThrow(RangeError);
    },
  );
});
