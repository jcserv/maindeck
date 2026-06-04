"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, RefreshCw, Eye, Glasses, Trash2, RotateCcw, SkipForward, Undo2, RotateCw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaytestState, PlaytestZone } from "../playtest-reducer";
import { CommandZone } from "./command-zone";
import { ManaPool } from "./mana-pool";

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 220;

interface ZoneRailProps {
  state: PlaytestState;
  onCastCommander: (idx: number) => void;
  onDecrementTax: (idx: number) => void;
  onZoneClick: (zone: PlaytestZone) => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
  onDraw: () => void;
  onMulligan: () => void;
  onScry: () => void;
  onSurveil: () => void;
  onMill: () => void;
  onShuffle: () => void;
  onUntapAll: () => void;
  onNextTurn: () => void;
  onUndo: () => void;
  onRestart: () => void;
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
  onZoneClick,
  onSendTo,
  onDraw,
  onMulligan,
  onScry,
  onSurveil,
  onMill,
  onShuffle,
  onUntapAll,
  onNextTurn,
  onUndo,
  onRestart,
  className,
}: ZoneRailProps) {
  const [dragOverZone, setDragOverZone] = useState<PlaytestZone | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragStartX = useRef<number | null>(null);
  const dragStartWidth = useRef<number>(DEFAULT_WIDTH);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;

    const onMove = (ev: PointerEvent) => {
      if (dragStartX.current === null) return;
      const delta = dragStartX.current - ev.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta)));
    };
    const onUp = () => {
      dragStartX.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [width]);

  return (
    <div className="flex shrink-0">
      {/* Drag handle */}
      <div
        className="w-2 flex items-center justify-center cursor-ew-resize group border-l border-border hover:border-primary transition-colors"
        onPointerDown={onPointerDown}
      >
        <div className="h-8 w-0.5 rounded-full bg-border group-hover:bg-primary transition-colors" />
      </div>

      <div
        className={cn("flex flex-col gap-3 p-3 overflow-y-auto", className)}
        style={{ width }}
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

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Actions
          </span>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onDraw}>
              <Plus size={11} /> Draw <kbd className="ml-auto opacity-50">D</kbd>
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onUntapAll}>
              <RotateCcw size={11} /> Untap All <kbd className="ml-auto opacity-50">U</kbd>
            </Button>
            <Button size="sm" className="text-xs h-7 gap-1 justify-start w-full" onClick={onNextTurn}>
              <SkipForward size={11} /> Next Turn <kbd className="ml-auto opacity-50">N</kbd>
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onScry}>
              <Eye size={11} /> Scry <kbd className="ml-auto opacity-50">S</kbd>
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onSurveil}>
              <Glasses size={11} /> Surveil <kbd className="ml-auto opacity-50">V</kbd>
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onMill}>
              <Trash2 size={11} /> Mill <kbd className="ml-auto opacity-50">M</kbd>
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onShuffle}>
              <Shuffle size={11} /> Shuffle <kbd className="ml-auto opacity-50">L</kbd>
            </Button>
            <div className="border-t border-border my-1" />
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onUndo} disabled={!state.prev}>
              <Undo2 size={11} /> Undo <kbd className="ml-auto opacity-50">Z</kbd>
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 justify-start w-full" onClick={onMulligan}>
              <RefreshCw size={11} /> Mull {Math.max(0, state.hand.length - 1)}
            </Button>
            <Button size="sm" variant="destructive" className="text-xs h-7 gap-1 justify-start w-full" onClick={onRestart}>
              <RotateCw size={11} /> Restart
            </Button>
          </div>
        </div>

        <div className="mt-auto pt-2">
          <ManaPool />
        </div>

      </div>
    </div>
  );
}
