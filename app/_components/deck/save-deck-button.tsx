"use client";

import { useOptimistic, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDeck, unsaveDeck } from "@/app/_actions/saved-decks";

interface SaveDeckButtonProps {
  deckId: string;
  initialSaved: boolean;
}

/**
 * Client toggle for the per-deck "save to my list" bookmark.
 *
 * The optimistic flip lets the icon switch immediately; if the server action
 * throws (e.g. a deck flipped to PRIVATE between render and click) React
 * rolls back the optimistic value and the next render reflects the truth.
 */
export function SaveDeckButton({ deckId, initialSaved }: SaveDeckButtonProps) {
  const [saved, setOptimistic] = useOptimistic<boolean, boolean>(
    initialSaved,
    (_, next) => next,
  );
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !saved;
    startTransition(async () => {
      setOptimistic(next);
      try {
        if (next) {
          await saveDeck(deckId);
        } else {
          await unsaveDeck(deckId);
        }
      } catch {
        // useOptimistic rewinds automatically when the transition rejects;
        // server-truth re-renders on the next pass.
      }
    });
  }

  const Icon = saved ? BookmarkCheck : Bookmark;
  const label = saved ? "Saved" : "Save";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
      aria-pressed={saved}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
