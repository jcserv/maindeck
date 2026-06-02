"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommanderEntry } from "../playtest-reducer";

interface CommandZoneProps {
  commanders: CommanderEntry[];
  onCast: (idx: number) => void;
  onDecrementTax: (idx: number) => void;
  className?: string;
}

export function CommandZone({ commanders, onCast, onDecrementTax, className }: CommandZoneProps) {
  if (commanders.length === 0) return null;

  return (
    <div className={cn("bg-muted/60 rounded-md p-3 flex flex-col gap-2", className)}>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Command Zone
      </span>
      {commanders.map((entry, idx) => {
        const tax = entry.castCount * 2;
        return (
          <div key={entry.card.instanceId} className="flex items-center gap-2">
            <span className="text-sm font-medium truncate flex-1">{entry.card.name}</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: entry.castCount }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary"
                  title={`Cast #${i + 1}`}
                />
              ))}
            </div>
            {tax > 0 && (
              <span className="text-xs text-muted-foreground">+{tax}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-6 px-2"
              onClick={() => onDecrementTax(idx)}
              disabled={entry.castCount === 0}
            >
              −tax
            </Button>
            <Button
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => onCast(idx)}
            >
              Cast
            </Button>
          </div>
        );
      })}
    </div>
  );
}
