import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import {
  PUBLIC_FORKS_PAGE_SIZE,
  getForkAncestorIds,
  getForkAncestry,
  getPublicForks,
} from "../fork-queries";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockFindMany = vi.mocked(prisma.deck.findMany);
const mockCount = vi.mocked(prisma.deck.count);
const mockCacheTag = vi.mocked(cacheTag);

const DECK_ID = "deck-leaf";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getForkAncestry", () => {
  it("issues a single SQL round-trip and tags the deck cache", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await getForkAncestry(DECK_ID);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockCacheTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("interpolates the deck id and the maxDepth into the recursive CTE", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await getForkAncestry(DECK_ID, 5);

    // Tagged-template invocation: $queryRaw is called with a TemplateStringsArray
    // followed by the interpolated values. The SQL must reference deck.id =
    // $deckId and a depth cap of 5 so the chain cannot blow past 5 ancestors.
    const args = mockQueryRaw.mock.calls[0]!;
    const sql = (args[0] as readonly string[]).join("?");
    expect(sql).toContain("WITH RECURSIVE ancestry");
    expect(sql).toContain("a.depth <");
    // The id is the first interpolated value, the depth cap is the second.
    expect(args[1]).toBe(DECK_ID);
    expect(args[2]).toBe(5);
  });

  it("caps the recursion depth at 5 by default", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await getForkAncestry(DECK_ID);

    const args = mockQueryRaw.mock.calls[0]!;
    expect(args[2]).toBe(5);
  });

  it("returns ancestors closest-first and unwraps depth as a number", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: "parent",
        name: "Parent",
        username: "alice",
        visibility: "PUBLIC",
        depth: 1,
      },
      {
        id: "grandparent",
        name: "Grand",
        username: "bob",
        visibility: "UNLISTED",
        depth: 2,
      },
    ] as never);

    const ancestry = await getForkAncestry(DECK_ID);

    expect(ancestry).toEqual([
      {
        masked: false,
        id: "parent",
        name: "Parent",
        username: "alice",
        depth: 1,
      },
      {
        masked: false,
        id: "grandparent",
        name: "Grand",
        username: "bob",
        depth: 2,
      },
    ]);
  });

  it("masks PRIVATE ancestors — identifying fields collapse to a placeholder row", async () => {
    // Mirrors what the SQL CASE WHEN visibility = 'PRIVATE' returns: id, name,
    // and username are NULL for private rows. The mapper must drop those
    // fields and surface only the depth so callers cannot leak private data.
    mockQueryRaw.mockResolvedValue([
      {
        id: null,
        name: null,
        username: null,
        visibility: "PRIVATE",
        depth: 1,
      },
      {
        id: "grandparent",
        name: "Grand",
        username: "bob",
        visibility: "PUBLIC",
        depth: 2,
      },
    ] as never);

    const ancestry = await getForkAncestry(DECK_ID);

    expect(ancestry[0]).toEqual({ masked: true, depth: 1 });
    expect(ancestry[1]).toMatchObject({
      masked: false,
      id: "grandparent",
      username: "bob",
    });
    // The private row must not surface name/username/id, even via spread.
    expect(ancestry[0]).not.toHaveProperty("name");
    expect(ancestry[0]).not.toHaveProperty("username");
    expect(ancestry[0]).not.toHaveProperty("id");
  });

  it("returns an empty list when the deck has no parent", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    const ancestry = await getForkAncestry(DECK_ID);

    expect(ancestry).toEqual([]);
  });
});

describe("getPublicForks", () => {
  it("filters to PUBLIC + externalSource null and tags the fork-lineage cache", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicForks(DECK_ID, 1);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          forkedFromId: DECK_ID,
          visibility: "PUBLIC",
          externalSource: null,
        },
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: {
        forkedFromId: DECK_ID,
        visibility: "PUBLIC",
        externalSource: null,
      },
    });
    expect(mockCacheTag).toHaveBeenCalledWith(`deck:${DECK_ID}:forks`);
  });

  it("paginates with the constant page size and a stable id tiebreaker", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicForks(DECK_ID, 3);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: (3 - 1) * PUBLIC_FORKS_PAGE_SIZE,
        take: PUBLIC_FORKS_PAGE_SIZE,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("clamps page <= 0 to page 1 (skip 0) so callers do not produce negative offsets", async () => {
    mockFindMany.mockResolvedValue([] as never);
    mockCount.mockResolvedValue(0 as never);

    await getPublicForks(DECK_ID, 0);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });

  it("returns the row count alongside the page rows", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "fork-1",
        name: "Fork",
        format: "COMMANDER",
        updatedAt: new Date("2026-01-01"),
        user: { username: "carol", image: null },
      },
    ] as never);
    mockCount.mockResolvedValue(42 as never);

    const result = await getPublicForks(DECK_ID, 1);

    expect(result.total).toBe(42);
    expect(result.forks).toHaveLength(1);
    expect(result.forks[0]).toMatchObject({ id: "fork-1", name: "Fork" });
  });
});

describe("getForkAncestorIds", () => {
  it("returns only ancestor IDs in closest-first order", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "parent", depth: 1 },
      { id: "grandparent", depth: 2 },
    ] as never);

    const ids = await getForkAncestorIds(DECK_ID);

    expect(ids).toEqual(["parent", "grandparent"]);
  });

  it("issues a single SQL round-trip and respects the maxDepth cap of 5", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await getForkAncestorIds(DECK_ID, 5);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const args = mockQueryRaw.mock.calls[0]!;
    expect(args[1]).toBe(DECK_ID);
    expect(args[2]).toBe(5);
  });

  it("defaults the depth cap to 5 when not specified", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await getForkAncestorIds(DECK_ID);

    const args = mockQueryRaw.mock.calls[0]!;
    expect(args[2]).toBe(5);
  });
});
