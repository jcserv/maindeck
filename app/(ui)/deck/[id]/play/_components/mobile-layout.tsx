"use client";

import { useState, useEffect } from "react";
import Link from "@/app/_components/link";
import type {
  PlaytestState,
  PlaytestAction,
  PlaytestZone,
} from "../playtest-reducer";
import { Battlefield } from "./battlefield";
import { HandDrawer } from "./hand-drawer";
import { CommandZone } from "./command-zone";
import { Fab } from "./fab";
import { Button } from "@/components/ui/button";
import { LookaheadOverlay } from "./lookahead-overlay";
import { ZoneLibraryView } from "./zone-library-view";

interface MobileLayoutProps {
  state: PlaytestState;
  dispatch: React.Dispatch<PlaytestAction>;
  deckName: string;
}

export function MobileLayout({ state, dispatch, deckName }: MobileLayoutProps) {
  const [handOpen, setHandOpen] = useState(false);
  const [viewZone, setViewZone] = useState<PlaytestZone | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleFab = () => {
    dispatch({ type: "nextTurn" });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0 text-sm">
        <Link href={`/deck/${state.deckId}`} className="text-muted-foreground" aria-label="Back to deck">
          ←
        </Link>
        <span className="font-semibold text-xs">Solo</span>
        <span className="text-muted-foreground text-xs truncate flex-1">
          {deckName}
        </span>
        <div className="flex items-center gap-0.5 text-xs tabular-nums shrink-0">
          <button
            className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
            onClick={() =>
              dispatch({ type: "setLifeTotal", n: state.lifeTotal - 1 })
            }
          >
            −
          </button>
          <span>{state.lifeTotal}</span>
          <button
            className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
            onClick={() =>
              dispatch({ type: "setLifeTotal", n: state.lifeTotal + 1 })
            }
          >
            +
          </button>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          T{state.turn}
        </span>
      </div>

      {/* Command zone strip */}
      {state.commanders.length > 0 && (
        <CommandZone
          commanders={state.commanders}
          onCast={(idx) => dispatch({ type: "castCommander", idx })}
          onDecrementTax={(idx) => dispatch({ type: "decrementTax", idx })}
          className="mx-2 mt-2 shrink-0"
        />
      )}

      {/* Zone chips row */}
      <div className="flex gap-2 px-3 py-1.5 shrink-0 overflow-x-auto">
        {(["library", "hand", "graveyard", "exile"] as PlaytestZone[]).map(
          (z) => (
            <button
              key={z}
              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap"
              onClick={() => {
                if (z === "hand") setHandOpen(true);
                else setViewZone(z);
              }}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)} {state[z].length}
            </button>
          ),
        )}
      </div>

      {/* Battlefield */}
      <Battlefield
        cards={state.battlefield}
        onTap={(id) => dispatch({ type: "tapCard", id })}
        onUntap={(id) => dispatch({ type: "untapCard", id })}
        onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
        className="flex-1"
      />

      {/* Bottom thumb bar */}
      <div className="flex items-center border-t border-border shrink-0">
        <div className="shrink-0 pl-3 py-2 border-r border-border">
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setHandOpen(true)}>Hand ({state.hand.length})</Button>
        </div>
        <div className="flex items-center gap-0.5 px-2 py-2 overflow-x-auto flex-1 min-w-0">
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => dispatch({ type: "draw" })}>Draw</Button>
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => dispatch({ type: "untapAll" })}>Untap</Button>
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => dispatch({ type: "startLookahead", mode: "scry", n: 1 })}>Scry</Button>
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => dispatch({ type: "startLookahead", mode: "surveil", n: 1 })}>Surveil</Button>
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => dispatch({ type: "mill", n: 1 })}>Mill</Button>
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => dispatch({ type: "shuffleLibrary" })}>Shuffle</Button>
          <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => dispatch({ type: "undo" })} disabled={!state.prev}>Undo</Button>
          <Button size="sm" variant="ghost" className="text-xs shrink-0 text-destructive hover:text-destructive" onClick={() => dispatch({ type: "resetGame" })}>Restart</Button>
        </div>
        <div className="shrink-0 pr-3 py-2 border-l border-border">
          <Fab onClick={handleFab} className="h-10 px-4 text-xs" />
        </div>
      </div>

      {state.lookahead && (
        <LookaheadOverlay
          mode={state.lookahead.mode}
          cards={state.lookahead.cards}
          extraLibrary={state.library.slice(state.lookahead.cards.length)}
          onResolve={(placements) =>
            dispatch({ type: "resolveLookahead", placements })
          }
        />
      )}

      {/* Zone viewer overlay */}
      {viewZone && (
        <div className="fixed inset-0 z-60 flex flex-col">
          <ZoneLibraryView
            zone={viewZone}
            cards={state[viewZone]}
            onClose={() => setViewZone(null)}
            onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
            {...(viewZone === "library" && {
              onMoveToTop: (id: string) => dispatch({ type: "moveToTop", id }),
              onMoveToBottom: (id: string) => dispatch({ type: "moveToBottom", id }),
              onReorder: (from: number, to: number) => dispatch({ type: "reorderLibrary", fromIndex: from, toIndex: to }),
            })}
            className="w-full h-full flex flex-col bg-background"
          />
        </div>
      )}

      {/* Hand drawer */}
      <HandDrawer
        hand={state.hand}
        open={handOpen}
        onOpenChange={setHandOpen}
        onMulligan={() =>
          dispatch({
            type: "mulliganTo",
            n: Math.max(0, state.hand.length - 1),
          })
        }
        onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
      />
    </div>
  );
}
