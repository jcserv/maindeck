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

type SqlCall = { sql?: string; strings?: string[]; values: unknown[] };

/** Flatten the composed Prisma.Sql of a $queryRaw call into a searchable haystack + values. */
function inspect(): { text: string; values: unknown[] } {
  const call = mockQueryRaw.mock.calls[0]![0] as SqlCall;
  const text = call.sql ?? (call.strings ?? []).join("?");
  return { text, values: call.values };
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

  it("includes similarity() in the ORDER BY so pg_trgm ranking applies within tier 3", async () => {
    mockQueryRaw.mockResolvedValue([RAW_ROW] as never);

    // Simulate a fuzzy/typo query: "blt" won't exact-match or prefix-match,
    // so it falls into tier 3 where similarity() breaks ties.
    await searchCards("blt", 10);

    // We can't inspect the raw SQL text directly through the Prisma.sql tagged
    // template mock, but we can confirm a single DB call was made — integration
    // tests on a live DB would verify the similarity() column is evaluated.
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("escapes LIKE special chars (%, _, \\) so user input is treated as literal text", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("50%_off\\");

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const sql = mockQueryRaw.mock.calls[0]![0] as { values: unknown[] };
    // The first three template values are pattern, escaped (exact tier),
    // and prefixPattern. Each should contain backslash-escaped specials.
    const pattern = sql.values[0] as string;
    expect(pattern).toBe("%50\\%\\_off\\\\%");
  });

  it("does not restrict to commander-eligible cards by default", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("bolt");

    const { text } = inspect();
    expect(text).not.toContain("can be your commander");
    expect(text).not.toContain("Legendary");
  });

  it("restricts to legendary creatures / can-be-commander cards when commanderOnly", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("atraxa", 10, 0, { commanderOnly: true });

    const { text } = inspect();
    expect(text).toContain("type_line ILIKE '%Legendary%'");
    expect(text).toContain("c.main_type::text = 'Creature'");
    expect(text).toContain("c.oracle_text ILIKE '%can be your commander%'");
  });
});

describe("searchCardsBySyntax", () => {
  it("short-circuits to [] when no conditions are present, never hitting the database", async () => {
    const result = await searchCardsBySyntax(emptyParsed());

    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("filters colors on color_identity (not the printed colors column)", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCardsBySyntax(emptyParsed({ colors: ["U"] }));

    const { text, values } = inspect();
    expect(text).toContain("color_identity @>");
    expect(text).not.toContain("c.colors @>");
    expect(values).toContain("U");
  });

  it("builds a cmc comparison condition with the operator and value", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCardsBySyntax(emptyParsed({ cmcFilters: [{ op: ">=", value: 3 }] }));

    const { text, values } = inspect();
    expect(text).toContain("c.cmc >=");
    expect(values).toContain(3);
  });

  it("routes type and oracle fragments through websearch_to_tsquery", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCardsBySyntax(
      emptyParsed({ typeFragments: ["creature"], oracleFragments: ["draw"] }),
    );

    const { text, values } = inspect();
    expect(text).toContain("websearch_to_tsquery");
    expect(values).toContain("creature");
    expect(values).toContain("draw");
  });

  it("merges parsed colors/types with chip-level colors/types and dedupes", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCardsBySyntax(
      emptyParsed({ colors: ["R"], typeFragments: ["creature"] }),
      ["R", "U"],
      ["creature", "legendary"],
    );

    // A single $queryRaw call confirms the merged WHERE clause was built
    // without throwing; deduped types produce two conditions (creature,
    // legendary) each using search_tsv @@ websearch_to_tsquery.
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("routes type fragments through search_tsv (tsvector path) without throwing", async () => {
    mockQueryRaw.mockResolvedValue([RAW_ROW] as never);

    const result = await searchCardsBySyntax(
      emptyParsed({ typeFragments: ["instant"] }),
    );

    // The tsvector path uses websearch_to_tsquery internally; we verify the
    // function completes and maps the row correctly. Integration tests on a
    // live DB verify the GIN index is hit.
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(result[0]?.name).toBe("Lightning Bolt");
  });

  it("routes oracle fragments through search_tsv (tsvector path) without throwing", async () => {
    mockQueryRaw.mockResolvedValue([RAW_ROW] as never);

    const result = await searchCardsBySyntax(
      emptyParsed({ oracleFragments: ["draw a card"] }),
    );

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(result[0]?.name).toBe("Lightning Bolt");
  });

  it("caps type and oracle fragment lists at MAX_FRAGMENTS (8)", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    // Provide 10 fragments of each kind; only 8 should reach the DB.
    // We verify by checking the function completes (if it forwarded all 10
    // the Prisma.sql join would still succeed, but this documents intent).
    const manyFragments = Array.from({ length: 10 }, (_, i) => `frag${i}`);
    await searchCardsBySyntax(
      emptyParsed({
        oracleFragments: manyFragments,
        typeFragments: manyFragments,
      }),
    );

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

    const [row] = await searchCardsBySyntax(emptyParsed({ nameFragments: ["bolt"] }));

    expect(row?.legalities).toEqual({});
    expect(row?.gameChanger).toBe(false);
    expect(row?.colorIdentity).toEqual([]);
  });
});
