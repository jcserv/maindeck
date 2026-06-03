"use client";

import { useState } from "react";
import type { PlaytestState, PlaytestAction, PlaytestZone } from "../playtest-reducer";
import { ZoneRail } from "./zone-rail";
import { Battlefield } from "./battlefield";
import { HandStrip } from "./hand-strip";
import { ZoneLibraryView } from "./zone-library-view";
import { LookaheadOverlay } from "./lookahead-overlay";

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
        <div className="flex items-center gap-1 ml-4">
          <button
            className="w-5 h-5 rounded border border-border text-xs hover:bg-muted transition-colors"
            onClick={() => dispatch({ type: "setLifeTotal", n: state.lifeTotal - 1 })}
            aria-label="Lose 1 life"
          >−</button>
          <span className="text-sm font-bold tabular-nums w-8 text-center">{state.lifeTotal}</span>
          <button
            className="w-5 h-5 rounded border border-border text-xs hover:bg-muted transition-colors"
            onClick={() => dispatch({ type: "setLifeTotal", n: state.lifeTotal + 1 })}
            aria-label="Gain 1 life"
          >+</button>
        </div>
        <span className="ml-auto text-muted-foreground">T{state.turn}</span>
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
            onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
          />
        </div>

        {/* Right rail */}
        {viewingZone ? (
          <ZoneLibraryView
            zone={viewingZone}
            cards={state[viewingZone]}
            onClose={() => setViewingZone(null)}
            onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
          />
        ) : (
          <ZoneRail
            state={state}
            onCastCommander={(idx) => dispatch({ type: "castCommander", idx })}
            onDecrementTax={(idx) => dispatch({ type: "decrementTax", idx })}
            onZoneClick={(zone) => setViewingZone(zone)}
            onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
            onDraw={() => dispatch({ type: "draw" })}
            onMulligan={() => dispatch({ type: "mulliganTo", n: Math.max(0, state.hand.length - 1) })}
            onScry={() => dispatch({ type: "startLookahead", mode: "scry", n: 1 })}
            onSurveil={() => dispatch({ type: "startLookahead", mode: "surveil", n: 1 })}
            onMill={() => dispatch({ type: "mill", n: 1 })}
            onUntapAll={() => dispatch({ type: "untapAll" })}
            onNextTurn={() => dispatch({ type: "nextTurn" })}
            onUndo={() => dispatch({ type: "undo" })}
            onRestart={() => dispatch({ type: "resetGame" })}
          />
        )}
      </div>

      {state.lookahead && (
        <LookaheadOverlay
          mode={state.lookahead.mode}
          cards={state.lookahead.cards}
          extraLibrary={state.library.slice(state.lookahead.cards.length)}
          onResolve={(placements) => dispatch({ type: "resolveLookahead", placements })}
        />
      )}
    </div>
  );
}
