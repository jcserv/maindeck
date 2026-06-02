"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import type { PlaytestState, PlaytestAction, PlaytestZone } from "../playtest-reducer";
import { ZoneRail } from "./zone-rail";
import { Battlefield } from "./battlefield";
import { HandStrip } from "./hand-strip";
import { ZoneViewer } from "./zone-viewer";

interface DesktopLayoutProps {
  state: PlaytestState;
  dispatch: React.Dispatch<PlaytestAction>;
  deckName: string;
}

export function DesktopLayout({ state, dispatch, deckName }: DesktopLayoutProps) {
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
        <span className="ml-auto text-muted-foreground">
          T{state.turn}
        </span>
        <span className="text-xs text-muted-foreground font-mono" suppressHydrationWarning>#{state.seed.toString(16).padStart(8, "0")}</span>
        <button
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => dispatch({ type: "undo" })}
          disabled={!state.prev}
          aria-label="Undo"
        >
          <Undo2 size={12} /> Undo <kbd className="opacity-50">Z</kbd>
        </button>
      </div>

      {/* Main 3-pane */}
      <div className="flex flex-1 min-h-0">
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

        {/* Right rail */}
        <ZoneRail
          state={state}
          onCastCommander={(idx) => dispatch({ type: "castCommander", idx })}
          onDecrementTax={(idx) => dispatch({ type: "decrementTax", idx })}
          onSetLife={(n) => dispatch({ type: "setLifeTotal", n })}
          onZoneClick={(zone) => setViewingZone(zone)}
          onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
        />
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
