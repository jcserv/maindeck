"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PlaytestState, PlaytestAction, PlaytestZone } from "../playtest-reducer";
import { ZoneRail } from "./zone-rail";
import { Battlefield } from "./battlefield";
import { HandStrip } from "./hand-strip";
import { Sample100Panel } from "./sample100-panel";
import { ZoneViewer } from "./zone-viewer";

interface DesktopLayoutProps {
  state: PlaytestState;
  dispatch: React.Dispatch<PlaytestAction>;
  deckName: string;
  categories: string[];
  allCards: PlaytestState["library"];
}

export function DesktopLayout({ state, dispatch, deckName, categories, allCards }: DesktopLayoutProps) {
  const phase = state.phase;
  const [sampleOpen, setSampleOpen] = useState(false);
  const [viewingZone, setViewingZone] = useState<PlaytestZone | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Topbar */}
      <div className="flex items-center gap-4 px-4 h-11 border-b border-border shrink-0 text-sm">
        <a href={`/deck/${state.deckId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </a>
        <span className="font-semibold">Playtest</span>
        <span className="text-muted-foreground truncate max-w-[200px]">{deckName}</span>
        <span className="ml-auto capitalize text-muted-foreground">
          T{state.turn} · {phase}
        </span>
        <span className="text-xs text-muted-foreground font-mono" suppressHydrationWarning>#{state.seed.toString(16).padStart(8, "0")}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => dispatch({ type: "undo" })}
          disabled={!state.prev}
          aria-label="Undo"
        >
          Undo
        </button>
        <button
          className={cn(
            "text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors",
            sampleOpen && "bg-muted",
          )}
          onClick={() => setSampleOpen((o) => !o)}
          aria-label="Toggle 100× sample panel"
        >
          100×
        </button>
      </div>

      {/* Main 3-pane */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail */}
        <ZoneRail
          state={state}
          onCastCommander={(idx) => dispatch({ type: "castCommander", idx })}
          onDecrementTax={(idx) => dispatch({ type: "decrementTax", idx })}
          onSetLife={(n) => dispatch({ type: "setLifeTotal", n })}
          onZoneClick={(zone) => setViewingZone(zone)}
          onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
        />

        {/* Center: battlefield + hand strip */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <Battlefield
            cards={state.battlefield}
            onTap={(id) => dispatch({ type: "tapCard", id })}
            onUntap={(id) => dispatch({ type: "untapCard", id })}
            onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
            className="flex-1"
          />
          <HandStrip
            hand={state.hand}
            librarySize={state.library.length}
            onDraw={() => dispatch({ type: "draw" })}
            onMulligan={() => dispatch({ type: "mulliganTo", n: Math.max(0, state.hand.length - 1) })}
            onScry={() => dispatch({ type: "scryTop", n: 1 })}
            onUntapAll={() => dispatch({ type: "untapAll" })}
            onNextTurn={() => dispatch({ type: "nextTurn" })}
            onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
          />
        </div>

        {/* Right: sample100 (collapsible) */}
        {sampleOpen && (
          <div className="w-[320px] shrink-0 border-l border-border">
            <Sample100Panel
              cards={allCards}
              categories={categories}
              seed={state.seed}
            />
          </div>
        )}
      </div>

      {/* Zone viewer dialog */}
      {viewingZone && (
        <ZoneViewer
          zone={viewingZone}
          cards={state[viewingZone]}
          open={viewingZone !== null}
          onClose={() => setViewingZone(null)}
          onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
        />
      )}
    </div>
  );
}
