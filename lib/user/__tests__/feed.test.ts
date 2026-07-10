import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    follow: {
      findMany: vi.fn(),
    },
    deckRevision: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

import { cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { FEED_PAGE_SIZE, getFollowingUpdates } from "../feed";

const mockFollowFindMany = vi.mocked(prisma.follow.findMany);
const mockRevisionFindMany = vi.mocked(prisma.deckRevision.findMany);
const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockCacheTag = vi.mocked(cacheTag);

const VIEWER_ID = "viewer-1";
const EDITOR_ID = "editor-1";

const EDITOR = {
  id: EDITOR_ID,
  username: "bob",
  displayUsername: "Bob",
  name: "Bob Builder",
  image: null,
};

function revision(
  id: string,
  overrides: Partial<{
    userId: string;
    updatedAt: Date;
    changes: unknown;
    deck: { id: string; name: string; format: string };
  }> = {},
) {
  return {
    id,
    userId: EDITOR_ID,
    updatedAt: new Date("2026-07-01T12:00:00Z"),
    changes: [
      {
        cardId: 1,
        cardName: "Sol Ring",
        zone: "MAINBOARD",
        category: null,
        delta: 1,
      },
    ],
    deck: { id: "deck-1", name: "My Deck", format: "COMMANDER" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFollowingUpdates", () => {
  it("returns the zero-follow state without querying revisions or users", async () => {
    mockFollowFindMany.mockResolvedValue([] as never);

    const result = await getFollowingUpdates(VIEWER_ID);

    expect(result).toEqual({ followingCount: 0, items: [] });
    expect(mockRevisionFindMany).not.toHaveBeenCalled();
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("tags the viewer's following cache", async () => {
    mockFollowFindMany.mockResolvedValue([] as never);

    await getFollowingUpdates(VIEWER_ID);

    expect(mockCacheTag).toHaveBeenCalledWith(`user:${VIEWER_ID}:following`);
  });

  it("queries public DECK revisions by followed editors, newest first, one page", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followingId: EDITOR_ID },
      { followingId: "editor-2" },
    ] as never);
    mockRevisionFindMany.mockResolvedValue([revision("rev-1")] as never);
    mockUserFindMany.mockResolvedValue([EDITOR] as never);

    const result = await getFollowingUpdates(VIEWER_ID);

    expect(mockRevisionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: { in: [EDITOR_ID, "editor-2"] },
          deck: { visibility: "PUBLIC", kind: "DECK" },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: FEED_PAGE_SIZE,
      }),
    );
    expect(result.followingCount).toBe(2);
    expect(result.items).toEqual([
      {
        revisionId: "rev-1",
        updatedAt: new Date("2026-07-01T12:00:00Z"),
        deck: { id: "deck-1", name: "My Deck", format: "COMMANDER" },
        editor: {
          username: "bob",
          displayUsername: "Bob",
          name: "Bob Builder",
          image: null,
        },
        changes: [
          {
            cardId: 1,
            cardName: "Sol Ring",
            zone: "MAINBOARD",
            category: null,
            delta: 1,
          },
        ],
      },
    ]);
  });

  it("dedupes editor ids before the user lookup", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followingId: EDITOR_ID },
    ] as never);
    mockRevisionFindMany.mockResolvedValue([
      revision("rev-1"),
      revision("rev-2"),
    ] as never);
    mockUserFindMany.mockResolvedValue([EDITOR] as never);

    await getFollowingUpdates(VIEWER_ID);

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [EDITOR_ID] } } }),
    );
  });

  it("skips revisions whose editor row is missing", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followingId: EDITOR_ID },
    ] as never);
    mockRevisionFindMany.mockResolvedValue([
      revision("rev-1", { userId: "deleted-user" }),
      revision("rev-2"),
    ] as never);
    mockUserFindMany.mockResolvedValue([EDITOR] as never);

    const { items } = await getFollowingUpdates(VIEWER_ID);

    expect(items).toHaveLength(1);
    expect(items[0]!.revisionId).toBe("rev-2");
  });

  it("skips revisions with malformed changes payloads", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followingId: EDITOR_ID },
    ] as never);
    mockRevisionFindMany.mockResolvedValue([
      revision("rev-1", { changes: { not: "an array" } }),
      revision("rev-2"),
    ] as never);
    mockUserFindMany.mockResolvedValue([EDITOR] as never);

    const { items } = await getFollowingUpdates(VIEWER_ID);

    expect(items).toHaveLength(1);
    expect(items[0]!.revisionId).toBe("rev-2");
  });

  it("skips the user lookup when no revisions match", async () => {
    mockFollowFindMany.mockResolvedValue([
      { followingId: EDITOR_ID },
    ] as never);
    mockRevisionFindMany.mockResolvedValue([] as never);

    const result = await getFollowingUpdates(VIEWER_ID);

    expect(result).toEqual({ followingCount: 1, items: [] });
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });
});
