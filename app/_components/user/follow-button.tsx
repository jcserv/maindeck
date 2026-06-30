"use client";

import { useOptimistic, useTransition } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { followUser, unfollowUser } from "@/app/_actions/user-follows";

interface FollowButtonProps {
  targetUserId: string;
  initialIsFollowing: boolean;
  followerCount: number;
}

interface FollowState {
  isFollowing: boolean;
  count: number;
}

export function FollowButton({
  targetUserId,
  initialIsFollowing,
  followerCount,
}: FollowButtonProps) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic<FollowState, boolean>(
    { isFollowing: initialIsFollowing, count: followerCount },
    (state, next) => {
      if (state.isFollowing === next) return state;
      return {
        isFollowing: next,
        count: state.count + (next ? 1 : -1),
      };
    },
  );

  function handleClick() {
    const next = !optimistic.isFollowing;
    startTransition(async () => {
      setOptimistic(next);
      try {
        if (next) {
          await followUser(targetUserId);
        } else {
          await unfollowUser(targetUserId);
        }
      } catch {
        // useOptimistic rewinds on transition rejection; server state wins.
      }
    });
  }

  const Icon = optimistic.isFollowing ? UserCheck : UserPlus;
  const label = optimistic.isFollowing ? "Unfollow" : "Follow";

  return (
    <Button
      type="button"
      variant={optimistic.isFollowing ? "secondary" : "default"}
      size="sm"
      onClick={handleClick}
      aria-pressed={optimistic.isFollowing}
      aria-label={optimistic.isFollowing ? "Unfollow user" : "Follow user"}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
