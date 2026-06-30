import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/deck/compare-queries", () => ({
  loadTextComparison: vi.fn(),
}));

import { loadTextComparison } from "@/lib/deck/compare-queries";
import { compareFromPaste } from "../actions";

const mockLoadTextComparison = vi.mocked(loadTextComparison);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("compareFromPaste", () => {
  it("delegates to loadTextComparison and returns its result", async () => {
    const result = { added: [], removed: [], shared: [] } as unknown as Awaited<ReturnType<typeof compareFromPaste>>;
    mockLoadTextComparison.mockResolvedValueOnce(result);

    const returned = await compareFromPaste("deck-url", "1 Sol Ring\n");

    expect(mockLoadTextComparison).toHaveBeenCalledWith("deck-url", "1 Sol Ring\n");
    expect(returned).toBe(result);
  });

  it("propagates errors from loadTextComparison", async () => {
    mockLoadTextComparison.mockRejectedValueOnce(new Error("fetch failed"));

    await expect(compareFromPaste("deck-url", "")).rejects.toThrow("fetch failed");
  });
});
