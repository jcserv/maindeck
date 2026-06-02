"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaytestState, PlaytestZone } from "../playtest-reducer";
import { CommandZone } from "./command-zone";

interface ZoneRailProps {
  state: PlaytestState;
  onCastCommander: (idx: number) => void;
  onDecrementTax: (idx: number) => void;
  onSetLife: (n: number) => void;
  onZoneClick: (zone: PlaytestZone) => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
  className?: string;
}

const ZONES: { key: PlaytestZone; label: string }[] = [
  { key: "library", label: "Library" },
  { key: "hand", label: "Hand" },
  { key: "graveyard", label: "Graveyard" },
  { key: "exile", label: "Exile" },
];

export function ZoneRail({
  state,
  onCastCommander,
  onDecrementTax,
  onSetLife,
  onZoneClick,
  onSendTo,
  className,
}: ZoneRailProps) {
  const [dragOverZone, setDragOverZone] = useState<PlaytestZone | null>(null);

  return (
    <div
      className={cn(
        "w-[220px] shrink-0 flex flex-col gap-3 p-3 border-r border-border overflow-y-auto",
        className,
      )}
    >
      <CommandZone
        commanders={state.commanders}
        onCast={onCastCommander}
        onDecrementTax={onDecrementTax}
      />

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Zones
        </span>
        {ZONES.map(({ key, label }) => (
          <button
            key={key}
            data-drop-zone={key}
            className={cn(
              "flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted text-left transition-colors",
              "data-[drop-active]:bg-primary/20 data-[drop-active]:ring-1 data-[drop-active]:ring-primary",
              dragOverZone === key && "bg-muted/80",
            )}
            onClick={() => onZoneClick(key)}
            onDragOver={(e) => { e.preventDefault(); setDragOverZone(key); }}
            onDragLeave={() => setDragOverZone(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverZone(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) onSendTo(id, key);
            }}
          >
            <span>{label}</span>
            <span className="text-muted-foreground tabular-nums">
              {state[key].length}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Life
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => onSetLife(state.lifeTotal - 1)}
            aria-label="Lose 1 life"
          >
            −
          </Button>
          <span className="text-xl font-bold tabular-nums flex-1 text-center">
            {state.lifeTotal}
          </span>
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => onSetLife(state.lifeTotal + 1)}
            aria-label="Gain 1 life"
          >
            +
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
          <p className="font-semibold">Keybinds</p>
          <p>D draw · U untap · N next</p>
          <p>M mulligan · S scry · Z undo</p>
        </div>
      </div>
    </div>
  );
}
