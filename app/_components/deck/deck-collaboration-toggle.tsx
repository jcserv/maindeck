"use client";

import { useOptimistic, useTransition } from "react";
import { Users } from "lucide-react";
import { toggleDeckCollaboration } from "@/app/_actions/deck/collaboration";
import { cn } from "@/lib/utils";

interface DeckCollaborationToggleProps {
  deckId: string;
  enabled: boolean;
}

export function DeckCollaborationToggle({
  deckId,
  enabled,
}: DeckCollaborationToggleProps) {
  const [optimistic, setOptimistic] = useOptimistic<boolean, boolean>(
    enabled,
    (_, next) => next,
  );
  const [, startTransition] = useTransition();

  function handleClick() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      try {
        await toggleDeckCollaboration(deckId, next);
      } catch {
        // Server state is authoritative — on failure the optimistic value
        // unwinds and the stored value shows through on refresh.
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      role="switch"
      aria-checked={optimistic}
      aria-label={
        optimistic ? "Disable deck collaboration" : "Enable deck collaboration"
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-0.5 -mx-0.5",
        "hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        optimistic ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Users className="size-3" aria-hidden />
      <span>{optimistic ? "Collaboration on" : "Collaboration off"}</span>
    </button>
  );
}
