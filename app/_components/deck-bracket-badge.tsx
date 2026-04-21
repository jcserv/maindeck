"use client";

import { useTransition } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { updateDeckManualBracket } from "@/lib/deck/actions";
import { BRACKETS, type ResolvedBracket, getBracketInfo } from "@/lib/deck/brackets";
import { cn } from "@/lib/utils";

interface DeckBracketBadgeProps {
  deckId: string;
  resolved: ResolvedBracket;
  isOwner: boolean;
}

export function DeckBracketBadge({
  deckId,
  resolved,
  isOwner,
}: DeckBracketBadgeProps) {
  const [isPending, startTransition] = useTransition();
  const { bracket, suggested, gameChangers, manual, gameChangerCards } =
    resolved;
  const info = getBracketInfo(bracket);

  function handleSelect(value: string) {
    const next = value === "auto" ? null : Number(value);
    startTransition(async () => {
      try {
        await updateDeckManualBracket(deckId, next);
      } catch {
        // Silent — user will see stale value on refresh if the mutation fails.
      }
    });
  }

  const bracketLabel = info ? `${info.name}` : `Bracket ${bracket}`;
  const triggerAria = `Commander bracket ${bracket}${manual ? " (manual)" : ""}`;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        className={cn(
          "inline-flex items-center gap-1 text-xs rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "text-muted-foreground hover:text-foreground",
        )}
        aria-label={triggerAria}
      >
        <span
          aria-hidden
          className="inline-flex items-center justify-center size-4 rounded-sm bg-muted border border-border font-mono text-[10.5px] font-semibold text-foreground"
        >
          {bracket}
        </span>
        <span className="hidden sm:inline">{bracketLabel}</span>
        {manual && (
          <span
            className="font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground/80"
            aria-hidden
          >
            manual
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="font-medium text-sm">{bracketLabel}</p>
            {info && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                {info.shortDescription}
              </p>
            )}
          </div>
          <span className="inline-flex items-center justify-center size-6 rounded bg-muted border border-border font-mono text-xs font-semibold">
            {bracket}
          </span>
        </div>

        <div className="border-t border-border pt-2 mt-2 text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-mono">{gameChangers}</span> game changer
            {gameChangers === 1 ? "" : "s"} in deck
          </p>
          <p>
            Suggested:{" "}
            <span className="font-mono">Bracket {suggested}</span>
            {manual && (
              <>
                {" "}· currently overridden to{" "}
                <span className="font-mono">Bracket {bracket}</span>
              </>
            )}
          </p>
        </div>

        {gameChangerCards.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Game changers
            </p>
            <ul className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
              {gameChangerCards.map((c) => (
                <li
                  key={c.name}
                  className="text-xs text-foreground flex justify-between gap-2"
                >
                  <span className="truncate">{c.name}</span>
                  {c.quantity > 1 && (
                    <span className="font-mono text-muted-foreground">
                      ×{c.quantity}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isOwner && (
          <div className="mt-3 border-t border-border pt-2">
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Set bracket</span>
              <select
                disabled={isPending}
                value={manual ? String(bracket) : "auto"}
                onChange={(e) => handleSelect(e.target.value)}
                className="h-7 rounded border border-border bg-card px-1.5 text-xs disabled:opacity-50"
              >
                <option value="auto">Auto (Bracket {suggested})</option>
                {BRACKETS.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.id} · {b.name}
                    {b.manualOnly ? " (manual only)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
