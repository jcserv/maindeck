import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/deck-access", () => ({
  requireDeckViewable: vi.fn(),
}));
vi.mock("@/lib/deck/queries", () => ({
  getDeckById: vi.fn(),
}));
vi.mock("@/lib/deck/io/adapters", () => ({
  serializers: [
    { id: "text", serialize: vi.fn(() => "TEXT_OUT") },
    { id: "arena", serialize: vi.fn(() => "ARENA_OUT") },
  ],
}));
vi.mock("@/lib/deck/io/serialize", () => ({
  toMaindeckJson: vi.fn(() => "JSON_OUT"),
}));

import { requireDeckViewable } from "@/lib/auth/deck-access";
import { getDeckById } from "@/lib/deck/queries";
import { getDeckExports } from "../export";

const mockRequire = vi.mocked(requireDeckViewable);
const mockGetDeck = vi.mocked(getDeckById);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequire.mockResolvedValue({ isOwner: true });
});

describe("getDeckExports", () => {
  it("returns text/arena/json from each adapter for a viewable deck", async () => {
    mockGetDeck.mockResolvedValue({ id: "d1", cards: [], categories: [] } as never);
    const out = await getDeckExports("d1");
    expect(out).toMatchObject({
      text: "TEXT_OUT",
      arena: "ARENA_OUT",
      json: "JSON_OUT",
    });
    expect(mockRequire).toHaveBeenCalledWith("d1");
  });

  it("returns empty strings when the deck no longer exists", async () => {
    mockGetDeck.mockResolvedValue(null);
    const out = await getDeckExports("missing");
    expect(out).toMatchObject({ text: "", arena: "", json: "" });
  });

  it("propagates the rejection when requireDeckViewable throws", async () => {
    mockRequire.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(getDeckExports("private")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockGetDeck).not.toHaveBeenCalled();
  });
});
