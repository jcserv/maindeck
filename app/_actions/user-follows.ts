"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { withActionLogging } from "@/lib/telemetry";
import { userFollowersTag, userFollowingTag, invalidateTags } from "@/lib/deck/cache-tags";

export const followUser = withActionLogging(
  "user.follow",
  async (targetUserId: string): Promise<void> => {
    const session = await requireSession();

    if (session.userId === targetUserId) {
      throw new Error("Cannot follow yourself");
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!target) {
      throw new Error("User not found");
    }

    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: session.userId,
          followingId: targetUserId,
        },
      },
      create: { followerId: session.userId, followingId: targetUserId },
      update: {},
    });

    invalidateTags([
      userFollowersTag(targetUserId),
      userFollowingTag(session.userId),
    ]);
  },
);

export const unfollowUser = withActionLogging(
  "user.unfollow",
  async (targetUserId: string): Promise<void> => {
    const session = await requireSession();

    if (session.userId === targetUserId) {
      throw new Error("Cannot unfollow yourself");
    }

    await prisma.follow.deleteMany({
      where: { followerId: session.userId, followingId: targetUserId },
    });

    invalidateTags([
      userFollowersTag(targetUserId),
      userFollowingTag(session.userId),
    ]);
  },
);
