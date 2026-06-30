import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    follow: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { followUser, unfollowUser } from "../user-follows";

const mockSession = vi.mocked(requireSession);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpsert = vi.mocked(prisma.follow.upsert);
const mockDeleteMany = vi.mocked(prisma.follow.deleteMany);
const mockUpdateTag = vi.mocked(updateTag);

const FOLLOWER_ID = "user-follower";
const PROFILE_ID = "user-profile";
const FOLLOWERS_TAG = `user:${PROFILE_ID}:followers`;
const FOLLOWING_TAG = `user:${FOLLOWER_ID}:following`;

function session(userId: string) {
  return {
    userId,
    email: `${userId}@test.com`,
    username: userId,
    dateOfBirth: new Date("1990-01-01"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("followUser", () => {
  it("upserts a follow row keyed by (followerId, followingId) for a valid target", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));
    mockUserFindUnique.mockResolvedValue({ id: PROFILE_ID } as never);
    mockUpsert.mockResolvedValue({} as never);

    await followUser(PROFILE_ID);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        followerId_followingId: {
          followerId: FOLLOWER_ID,
          followingId: PROFILE_ID,
        },
      },
      create: { followerId: FOLLOWER_ID, followingId: PROFILE_ID },
      update: {},
    });
  });

  it("invalidates the target's followers tag and the viewer's following tag", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));
    mockUserFindUnique.mockResolvedValue({ id: PROFILE_ID } as never);
    mockUpsert.mockResolvedValue({} as never);

    await followUser(PROFILE_ID);

    expect(mockUpdateTag).toHaveBeenCalledWith(FOLLOWERS_TAG);
    expect(mockUpdateTag).toHaveBeenCalledWith(FOLLOWING_TAG);
  });

  it("is idempotent — a second call upserts again without error", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));
    mockUserFindUnique.mockResolvedValue({ id: PROFILE_ID } as never);
    mockUpsert.mockResolvedValue({} as never);

    await followUser(PROFILE_ID);
    await followUser(PROFILE_ID);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("rejects self-follow before any DB call", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));

    await expect(followUser(FOLLOWER_ID)).rejects.toThrow(
      "Cannot follow yourself",
    );
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("rejects when the target user does not exist", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));
    mockUserFindUnique.mockResolvedValue(null);

    await expect(followUser(PROFILE_ID)).rejects.toThrow("User not found");
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });
});

describe("unfollowUser", () => {
  it("calls deleteMany with the correct (followerId, followingId)", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));
    mockDeleteMany.mockResolvedValue({ count: 1 } as never);

    await unfollowUser(PROFILE_ID);

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { followerId: FOLLOWER_ID, followingId: PROFILE_ID },
    });
  });

  it("invalidates both tags", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));
    mockDeleteMany.mockResolvedValue({ count: 1 } as never);

    await unfollowUser(PROFILE_ID);

    expect(mockUpdateTag).toHaveBeenCalledWith(FOLLOWERS_TAG);
    expect(mockUpdateTag).toHaveBeenCalledWith(FOLLOWING_TAG);
  });

  it("is idempotent — deleteMany returning count: 0 does not throw", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));
    mockDeleteMany.mockResolvedValue({ count: 0 } as never);

    await expect(unfollowUser(PROFILE_ID)).resolves.toBeUndefined();
    expect(mockUpdateTag).toHaveBeenCalledWith(FOLLOWERS_TAG);
    expect(mockUpdateTag).toHaveBeenCalledWith(FOLLOWING_TAG);
  });

  it("rejects self-unfollow before any DB call", async () => {
    mockSession.mockResolvedValue(session(FOLLOWER_ID));

    await expect(unfollowUser(FOLLOWER_ID)).rejects.toThrow(
      "Cannot unfollow yourself",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });
});
