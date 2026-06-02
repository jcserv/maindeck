"use client";

import { useState } from "react";
import type { PlaytestState, PlaytestAction, PlaytestZone } from "../playtest-reducer";
import { Battlefield } from "./battlefield";
import { HandDrawer } from "./hand-drawer";
import { CommandZone } from "./command-zone";
import { Fab } from "./fab";
import { Sample100Panel } from "./sample100-panel";
import BottomSheet from "@/app/_components/bottom-sheet";
import { Button } from "@/components/ui/button";

interface MobileLayoutProps {
  state: PlaytestState;
  dispatch: React.Dispatch<PlaytestAction>;
  deckName: string;
  categories: string[];
  allCards: PlaytestState["library"];
}

export function MobileLayout({ state, dispatch, deckName, categories, allCards }: MobileLayoutProps) {
  const [handOpen, setHandOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  const handleFab = () => {
    if (state.phase === "untap") {
      dispatch({ type: "untapAll" });
    } else if (state.phase === "draw") {
      dispatch({ type: "draw" });
    }
    dispatch({ type: "nextTurn" });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0 text-sm">
        <a href={`/deck/${state.deckId}`} className="text-muted-foreground">←</a>
        <span className="font-semibold text-xs">Solo</span>
        <span className="text-muted-foreground text-xs truncate flex-1">{deckName}</span>
        <span className="text-xs tabular-nums">T{state.turn}</span>
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
        {(["library", "hand", "graveyard", "exile"] as PlaytestZone[]).map((z) => (
          <button
            key={z}
            className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap"
            onClick={() => z === "hand" && setHandOpen(true)}
          >
            {z.charAt(0).toUpperCase() + z.slice(1)} {state[z].length}
          </button>
        ))}
        <button
          className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap"
        >
          Life {state.lifeTotal}
        </button>
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
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => dispatch({ type: "undo" })}
          disabled={!state.prev}
        >
          Undo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => setStatsOpen(true)}
        >
          100×
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => setHandOpen(true)}
        >
          Hand ({state.hand.length})
        </Button>
        <div className="flex-1" />
        <Fab phase={state.phase} onClick={handleFab} className="h-10 px-4 text-xs" />
      </div>

      {/* Hand drawer */}
      <HandDrawer
        hand={state.hand}
        open={handOpen}
        onOpenChange={setHandOpen}
        onMulligan={() => dispatch({ type: "mulliganTo", n: Math.max(0, state.hand.length - 1) })}
        onSendTo={(id, zone) => dispatch({ type: "sendTo", id, zone })}
      />

      {/* Sample100 sheet */}
      <BottomSheet open={statsOpen} onOpenChange={setStatsOpen} title="Sample 100×">
        <Sample100Panel
          cards={allCards}
          categories={categories}
          seed={state.seed}
          className="px-0"
        />
      </BottomSheet>
    </div>
  );
}
