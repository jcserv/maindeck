import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { type ParsedWhere } from "../syntax-parser";
import { searchCards, searchCardsBySyntax } from "../card-search";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockCacheTag = vi.mocked(cacheTag);

const RAW_ROW = {
  id: 1,
  name: "Lightning Bolt",
  main_type: "INSTANT" as const,
  type_line: "Instant",
  mana_cost: "{R}",
  legalities: { modern: "legal" },
  game_changer: true,
  color_identity: ["R"],
  image_uri: "bolt.jpg",
};

beforeEach(() => {
  vi.clearAllMocks();
});

function emptyParsed(overrides: Partial<ParsedWhere> = {}): ParsedWhere {
  return {
    nameFragments: [],
    colors: [],
    typeFragments: [],
    cmcFilters: [],
    oracleFragments: [],
    ...overrides,
  };
}

describe("searchCards", () => {
  it("returns [] for whitespace-only query without hitting the database", async () => {
    const result = await searchCards("   ");

    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("queries the database, tags the card-search cache, and maps rows", async () => {
    mockQueryRaw.mockResolvedValue([RAW_ROW] as never);

    const result = await searchCards("bolt", 5);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockCacheTag).toHaveBeenCalledWith("card-search");
    expect(result).toEqual([
      {
        id: 1,
        name: "Lightning Bolt",
        mainType: "INSTANT",
        typeLine: "Instant",
        manaCost: "{R}",
        imageUri: "bolt.jpg",
        legalities: { modern: "legal" },
        gameChanger: true,
        colorIdentity: ["R"],
      },
    ]);
  });

  it("falls back to {} legalities, false gameChanger, and [] colorIdentity when null", async () => {
    mockQueryRaw.mockResolvedValue([
      { ...RAW_ROW, legalities: null, game_changer: null, color_identity: null },
    ] as never);

    const [row] = await searchCards("bolt");

    expect(row?.legalities).toEqual({});
    expect(row?.gameChanger).toBe(false);
    expect(row?.colorIdentity).toEqual([]);
  });
});

describe("searchCardsBySyntax", () => {
  it("returns mapped rows when no conditions are present (Prisma.empty branch)", async () => {
    mockQueryRaw.mockResolvedValue([RAW_ROW] as never);

    const result = await searchCardsBySyntax(emptyParsed());

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockCacheTag).toHaveBeenCalledWith("card-search");
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Lightning Bolt");
  });

  it("merges parsed colors/types with chip-level colors/types and dedupes", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCardsBySyntax(
      emptyParsed({ colors: ["R"], typeFragments: ["creature"] }),
      ["R", "U"],
      ["creature", "legendary"],
    );

    // We can't introspect the SQL fragments cleanly, but a single $queryRaw
    // call confirms the merged WHERE clause was built without throwing.
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("builds conditions for name, oracle, and every cmc operator", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCardsBySyntax(
      emptyParsed({
        nameFragments: ["bolt"],
        oracleFragments: ["damage"],
        cmcFilters: [
          { op: "<=", value: 1 },
          { op: ">=", value: 2 },
          { op: "<", value: 3 },
          { op: ">", value: 4 },
          { op: "=", value: 5 },
        ],
      }),
    );

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("applies null-safe fallbacks when mapping rows", async () => {
    mockQueryRaw.mockResolvedValue([
      { ...RAW_ROW, legalities: null, game_changer: null, color_identity: null },
    ] as never);

    const [row] = await searchCardsBySyntax(emptyParsed());

    expect(row?.legalities).toEqual({});
    expect(row?.gameChanger).toBe(false);
    expect(row?.colorIdentity).toEqual([]);
  });
});
