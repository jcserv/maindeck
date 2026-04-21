import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    card: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(
    <T>(_key: string, _ttl: number, loader: () => Promise<T>) => loader(),
  ),
}));
const mockRedisGet = vi.fn();
const mockRedisIncr = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(async () => ({
    get: mockRedisGet,
    incr: mockRedisIncr,
  })),
}));

import { prisma } from "@/lib/db";
import { getOrSet } from "@/lib/cache";
import {
  bumpSearchVersion,
  searchCards,
  searchCardsBySyntax,
} from "../card-search";
import type { ParsedWhere } from "@/app/_components/search/syntax-parser";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockFindMany = vi.mocked(prisma.card.findMany);
const mockGetOrSet = vi.mocked(getOrSet);

function parsedWhere(overrides: Partial<ParsedWhere> = {}): ParsedWhere {
  return {
    nameFragments: [],
    colors: [],
    typeFragments: [],
    cmcFilters: [],
    oracleFragments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisIncr.mockResolvedValue(1);
});

describe("searchCards", () => {
  it("returns empty array for an empty/whitespace query without touching the DB", async () => {
    await expect(searchCards("")).resolves.toEqual([]);
    await expect(searchCards("   ")).resolves.toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("maps raw rows into the typed result shape", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: 1,
        name: "Lightning Bolt",
        main_type: "Instant",
        type_line: "Instant",
        mana_cost: "{R}",
        image_uri: "https://example.com/bolt.jpg",
        legalities: { standard: "not_legal", legacy: "legal" },
        game_changer: null,
        color_identity: ["R"],
      },
      {
        id: 2,
        name: "Lightning Helix",
        main_type: "Instant",
        type_line: null,
        mana_cost: null,
        image_uri: "https://example.com/helix.jpg",
        legalities: null,
        game_changer: true,
        color_identity: null,
      },
    ] as never);

    const result = await searchCards("Lightning");

    expect(result).toEqual([
      {
        id: 1,
        name: "Lightning Bolt",
        mainType: "Instant",
        typeLine: "Instant",
        manaCost: "{R}",
        imageUri: "https://example.com/bolt.jpg",
        legalities: { standard: "not_legal", legacy: "legal" },
        gameChanger: false,
        colorIdentity: ["R"],
      },
      {
        id: 2,
        name: "Lightning Helix",
        mainType: "Instant",
        typeLine: null,
        manaCost: null,
        imageUri: "https://example.com/helix.jpg",
        legalities: {},
        gameChanger: true,
        colorIdentity: [],
      },
    ]);
  });

  it("accepts injection-ish input without throwing (parameterized via Prisma.sql)", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await expect(searchCards("'; DROP TABLE card;--")).resolves.toEqual([]);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);

    // Prisma.sql builds a tagged Sql object; the user input must be threaded
    // through as a parameter, not concatenated into the query string.
    const [sqlArg] = mockQueryRaw.mock.calls[0]!;
    const values = (sqlArg as { values?: unknown[] }).values;
    expect(values).toBeDefined();
    // The trimmed input shows up verbatim in the bound params.
    expect(values).toEqual(
      expect.arrayContaining(["%'; DROP TABLE card;--%"]),
    );
  });

  it("trims leading/trailing whitespace before searching", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("  Lightning  ");

    const [sqlArg] = mockQueryRaw.mock.calls[0]!;
    const values = (sqlArg as { values?: unknown[] }).values ?? [];
    expect(values).toEqual(
      expect.arrayContaining(["%Lightning%", "Lightning", "Lightning%"]),
    );
  });

  it("derives a stable cache key from normalized query input", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("lightning", 10);
    await searchCards("lightning", 10);

    const key1 = mockGetOrSet.mock.calls[0]?.[0];
    const key2 = mockGetOrSet.mock.calls[1]?.[0];
    expect(key1).toBeDefined();
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^search:v\d+:[0-9a-f]{12}$/);
  });
});

describe("searchCardsBySyntax", () => {
  it("returns [] when findMany yields no rows and never runs the image query", async () => {
    mockFindMany.mockResolvedValue([] as never);

    const result = await searchCardsBySyntax(parsedWhere({ nameFragments: ["bolt"] }));

    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("merges chip-level colors/types with parsed tokens and dedupes", async () => {
    mockFindMany.mockResolvedValue([] as never);

    await searchCardsBySyntax(
      parsedWhere({ colors: ["R"], typeFragments: ["creature"] }),
      ["R", "G"],
      ["creature", "legendary"],
    );

    const arg = mockFindMany.mock.calls[0]?.[0];
    const and = (arg as { where: { AND: unknown[] } }).where.AND;
    // Colors: R (parsed) + G (chip) — R should only appear once.
    const colorClauses = and.filter(
      (c): c is { colors: { has: string } } =>
        typeof c === "object" && c !== null && "colors" in c,
    );
    expect(colorClauses).toEqual([
      { colors: { has: "R" } },
      { colors: { has: "G" } },
    ]);
    // Types: creature (parsed) + legendary (chip) — creature dedup'd.
    const typeClauses = and.filter(
      (c): c is { typeLine: { contains: string; mode: string } } =>
        typeof c === "object" && c !== null && "typeLine" in c,
    );
    expect(typeClauses).toEqual([
      { typeLine: { contains: "creature", mode: "insensitive" } },
      { typeLine: { contains: "legendary", mode: "insensitive" } },
    ]);
  });

  it("builds AND clauses for name, color, type, and oracle fragments", async () => {
    mockFindMany.mockResolvedValue([] as never);

    await searchCardsBySyntax(
      parsedWhere({
        nameFragments: ["bolt"],
        colors: ["R"],
        typeFragments: ["instant"],
        oracleFragments: ["damage"],
      }),
    );

    const arg = mockFindMany.mock.calls[0]?.[0];
    const and = (arg as { where: { AND: unknown[] } }).where.AND;
    expect(and).toEqual(
      expect.arrayContaining([
        { name: { contains: "bolt", mode: "insensitive" } },
        { colors: { has: "R" } },
        { typeLine: { contains: "instant", mode: "insensitive" } },
        { oracleText: { contains: "damage", mode: "insensitive" } },
      ]),
    );
  });

  it.each([
    ["<=", { lte: 3 }],
    [">=", { gte: 3 }],
    ["<", { lt: 3 }],
    [">", { gt: 3 }],
    ["=", { equals: 3 }],
  ] as const)("maps CMC operator %s to the matching Prisma filter", async (op, expected) => {
    mockFindMany.mockResolvedValue([] as never);

    await searchCardsBySyntax(
      parsedWhere({ cmcFilters: [{ op, value: 3 }] }),
    );

    const arg = mockFindMany.mock.calls[0]?.[0];
    const and = (arg as { where: { AND: unknown[] } }).where.AND;
    expect(and).toContainEqual({ cmc: expected });
  });

  it("joins image URIs via DISTINCT ON and drops cards with no printing image", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Lightning Bolt",
        mainType: "Instant",
        typeLine: "Instant",
        manaCost: "{R}",
        legalities: { modern: "legal" },
        gameChanger: false,
        colorIdentity: ["R"],
      },
      {
        id: 2,
        name: "Orphan",
        mainType: "Instant",
        typeLine: null,
        manaCost: null,
        legalities: null,
        gameChanger: false,
        colorIdentity: null,
      },
    ] as never);
    mockQueryRaw.mockResolvedValue([
      { card_id: 1, image_uri: "bolt.jpg" },
    ] as never);

    const result = await searchCardsBySyntax(
      parsedWhere({ nameFragments: ["a"] }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 1,
      name: "Lightning Bolt",
      mainType: "Instant",
      typeLine: "Instant",
      manaCost: "{R}",
      imageUri: "bolt.jpg",
      legalities: { modern: "legal" },
      gameChanger: false,
      colorIdentity: ["R"],
    });

    // Verify the DISTINCT ON query was threaded the card ids as a bound param.
    const [sqlArg] = mockQueryRaw.mock.calls[0]!;
    const values = (sqlArg as { values?: unknown[] }).values ?? [];
    expect(values).toEqual(expect.arrayContaining([[1, 2]]));
  });

  it("maps null legalities to {} when assembling the response", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Plain",
        mainType: "Instant",
        typeLine: null,
        manaCost: null,
        legalities: null,
        gameChanger: false,
      },
    ] as never);
    mockQueryRaw.mockResolvedValue([
      { card_id: 1, image_uri: "img.jpg" },
    ] as never);

    const [row] = await searchCardsBySyntax(parsedWhere({ nameFragments: ["a"] }));
    expect(row!.legalities).toEqual({});
  });
});

describe("search version", () => {
  it("keys searches under the live version from Redis", async () => {
    mockRedisGet.mockResolvedValue("7");
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("lightning");

    expect(mockRedisGet).toHaveBeenCalledWith("search:version");
    const key = mockGetOrSet.mock.calls[0]?.[0];
    expect(key).toMatch(/^search:v7:[0-9a-f]{12}$/);
  });

  it("falls back to v1 when the version is missing or unparseable", async () => {
    mockRedisGet.mockResolvedValue("not-a-number");
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("lightning");

    const key = mockGetOrSet.mock.calls[0]?.[0];
    expect(key).toMatch(/^search:v1:/);
  });

  it("swallows Redis read failures and defaults the version to 1", async () => {
    mockRedisGet.mockRejectedValue(new Error("redis down"));
    mockQueryRaw.mockResolvedValue([] as never);

    await searchCards("lightning");

    const key = mockGetOrSet.mock.calls[0]?.[0];
    expect(key).toMatch(/^search:v1:/);
  });

  it("bumpSearchVersion issues INCR against the version key", async () => {
    await bumpSearchVersion();
    expect(mockRedisIncr).toHaveBeenCalledWith("search:version");
  });

  it("bumpSearchVersion swallows Redis write errors", async () => {
    mockRedisIncr.mockRejectedValue(new Error("redis down"));
    await expect(bumpSearchVersion()).resolves.toBeUndefined();
  });

  it("uses v1 and is a no-op when Redis is not configured", async () => {
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockResolvedValueOnce(null);
    mockQueryRaw.mockResolvedValue([] as never);
    await searchCards("lightning");
    const key = mockGetOrSet.mock.calls[0]?.[0];
    expect(key).toMatch(/^search:v1:/);

    vi.mocked(getRedis).mockResolvedValueOnce(null);
    await expect(bumpSearchVersion()).resolves.toBeUndefined();
    expect(mockRedisIncr).not.toHaveBeenCalled();
  });
});
