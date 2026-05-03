import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search/card-search", () => ({
  searchCardsBySyntax: vi.fn(),
}));

import { searchCardsBySyntax } from "@/lib/search/card-search";
import { translateAndSearch } from "../search-ai-stub";

const mockSearch = vi.mocked(searchCardsBySyntax);

beforeEach(() => {
  vi.clearAllMocks();
  mockSearch.mockResolvedValue([]);
});

describe("translateAndSearch — keyword translation", () => {
  it.each([
    ["white angels with lifelink", "c:w"],
    ["blue counterspells", "c:u"],
    ["black removal that destroys", "c:b"],
    ["red goblins with haste", "c:r"],
    ["green elf ramp", "c:g"],
  ])("maps color keyword in %s → %s", async (prompt, expectedClause) => {
    const out = await translateAndSearch(prompt);
    expect(out.syntax).toContain(expectedClause);
  });

  it.each([
    ["creature spells", "t:creature"],
    ["instant tricks", "t:instant"],
    ["sorcery", "t:sorcery"],
    ["artifact ramp", "t:artifact"],
    ["enchantment auras", "t:enchantment"],
    ["planeswalker", "t:planeswalker"],
    ["land base", "t:land"],
  ])("maps type keyword in %s → %s", async (prompt, expectedClause) => {
    const out = await translateAndSearch(prompt);
    expect(out.syntax).toContain(expectedClause);
  });

  it("maps 'flying' to o:flying", async () => {
    const out = await translateAndSearch("show me fliers");
    expect(out.syntax).toContain("o:flying");
  });

  it("maps 'haste' to o:haste", async () => {
    const out = await translateAndSearch("with haste");
    expect(out.syntax).toContain("o:haste");
  });

  it("maps 'draw a card' to o:\"draw a card\"", async () => {
    const out = await translateAndSearch("anything that lets me draw a card");
    expect(out.syntax).toContain('o:"draw a card"');
  });

  it("maps 'under N' to cmc<=N", async () => {
    const out = await translateAndSearch("creatures under 3");
    expect(out.syntax).toContain("cmc<=3");
  });

  it("maps 'cheap' to cmc<=2 (regex fallback)", async () => {
    const out = await translateAndSearch("cheap things");
    expect(out.syntax).toContain("cmc<=2");
  });

  it("falls back to t:creature cmc<=3 when nothing matches", async () => {
    const out = await translateAndSearch("xyz");
    expect(out.syntax).toBe("t:creature cmc<=3");
  });

  it("passes the parsed syntax to searchCardsBySyntax", async () => {
    mockSearch.mockResolvedValue([
      {
        id: 1,
        name: "Lightning Bolt",
        mainType: "INSTANT",
        typeLine: "Instant",
        manaCost: "{R}",
        imageUri: "/x",
        legalities: {},
        gameChanger: false,
        colorIdentity: ["R"],
      } as never,
    ]);
    const out = await translateAndSearch("red burn");
    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [parsed, , , limit] = mockSearch.mock.calls[0]!;
    expect(parsed.colors).toContain("R");
    expect(limit).toBe(60);
    expect(out.results).toHaveLength(1);
  });
});
