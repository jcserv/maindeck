"use client";

import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { likeDeck, unlikeDeck } from "@/app/_actions/deck-likes";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  deckId: string;
  /** Initial like count from the server. */
  likeCount: number;
  /** Whether the current viewer has already liked this deck. */
  liked: boolean;
}

interface LikeState {
  liked: boolean;
  count: number;
}

export function LikeButton({ deckId, likeCount, liked }: LikeButtonProps) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic<LikeState, boolean>(
    { liked, count: likeCount },
    (state, next) => {
      // Optimistic toggle is idempotent — clicking "like" while already liked
      // doesn't double-count locally.
      if (state.liked === next) return state;
      return {
        liked: next,
        count: state.count + (next ? 1 : -1),
      };
    },
  );

  function handleClick() {
    if (pending) return;
    const next = !optimistic.liked;
    startTransition(async () => {
      setOptimistic(next);
      try {
        if (next) {
          await likeDeck(deckId);
        } else {
          await unlikeDeck(deckId);
        }
      } catch {
        // Server state is authoritative; the optimistic value rolls back when
        // the transition resolves and the server-rendered count re-streams.
      }
    });
  }

  const label = optimistic.liked ? "Unlike deck" : "Like deck";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      aria-label={label}
      aria-pressed={optimistic.liked}
    >
      <Heart
        className={cn(
          "size-3.5",
          optimistic.liked && "fill-current text-red-500",
        )}
        aria-hidden
      />
      <span>{optimistic.count}</span>
    </Button>
  );
}
