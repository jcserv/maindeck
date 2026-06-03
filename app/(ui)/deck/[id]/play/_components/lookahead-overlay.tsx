"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, Skull, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LookaheadMode, LookaheadDest, PlaytestCard } from "../playtest-reducer";

interface Placement {
  id: string;
  dest: LookaheadDest;
}

interface LookaheadOverlayProps {
  mode: LookaheadMode;
  cards: PlaytestCard[];
  extraLibrary: PlaytestCard[];
  onResolve: (placements: Placement[]) => void;
}

const DEST_CONFIG: Record<LookaheadMode, { options: LookaheadDest[]; default: LookaheadDest }> = {
  scry:    { options: ["top", "bottom"],    default: "top" },
  surveil: { options: ["top", "graveyard"], default: "top" },
};

const DEST_LABEL: Record<LookaheadDest, { label: string; icon: React.ReactNode; active: string }> = {
  top:      { label: "Top",       icon: <ArrowUp size={12} />,   active: "border-border bg-muted/40" },
  bottom:   { label: "Bottom",    icon: <ArrowDown size={12} />, active: "border-destructive/60 bg-destructive/10 text-muted-foreground" },
  graveyard:{ label: "Graveyard", icon: <Skull size={12} />,     active: "border-destructive/60 bg-destructive/10 text-muted-foreground" },
};

const MODE_TITLE: Record<LookaheadMode, string> = {
  scry:    "Scry",
  surveil: "Surveil",
};

const MODE_HINT: Record<LookaheadMode, string> = {
  scry:    "Choose where each card goes: keep on top or send to the bottom.",
  surveil: "Choose where each card goes: keep on top or send to the graveyard.",
};

export function LookaheadOverlay({ mode, cards, extraLibrary, onResolve }: LookaheadOverlayProps) {
  const { options, default: defaultDest } = DEST_CONFIG[mode];

  const [displayCards, setDisplayCards] = useState<PlaytestCard[]>(cards);
  const [extraIndex, setExtraIndex] = useState(0);
  const [dests, setDests] = useState<Record<string, LookaheadDest>>(
    () => Object.fromEntries(cards.map((c) => [c.instanceId, defaultDest])),
  );

  const cycle = (id: string) => {
    setDests((prev) => {
      const cur = prev[id] ?? defaultDest;
      const next = options[(options.indexOf(cur) + 1) % options.length]!;
      return { ...prev, [id]: next };
    });
  };

  const addCard = () => {
    const next = extraLibrary[extraIndex];
    if (!next) return;
    setDisplayCards((prev) => [...prev, next]);
    setDests((prev) => ({ ...prev, [next.instanceId]: defaultDest }));
    setExtraIndex((i) => i + 1);
  };

  const removeLast = () => {
    if (displayCards.length <= 1) return;
    const last = displayCards[displayCards.length - 1]!;
    setDisplayCards((prev) => prev.slice(0, -1));
    setDests((prev) => {
      const next = { ...prev };
      delete next[last.instanceId];
      return next;
    });
    if (extraLibrary.some((c) => c.instanceId === last.instanceId)) {
      setExtraIndex((i) => i - 1);
    }
  };

  const handleConfirm = () => {
    onResolve(displayCards.map((c) => ({ id: c.instanceId, dest: dests[c.instanceId] ?? defaultDest })));
  };

  const canAdd = extraIndex < extraLibrary.length;
  const canRemove = displayCards.length > 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-lg p-4 flex flex-col gap-4 max-w-sm w-full mx-4">
        <div>
          <p className="font-semibold text-sm">{MODE_TITLE[mode]} {displayCards.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{MODE_HINT[mode]}</p>
        </div>

        <div className="flex flex-col gap-2">
          {displayCards.map((card) => {
            const dest = dests[card.instanceId] ?? defaultDest;
            const destMeta = DEST_LABEL[dest];
            return (
              <button
                key={card.instanceId}
                onClick={() => cycle(card.instanceId)}
                className={[
                  "flex items-center gap-3 rounded border p-2 text-left transition-colors",
                  destMeta.active,
                ].join(" ")}
              >
                {card.imageUri && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUri}
                    alt={card.name}
                    className="w-10 h-14 rounded object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{card.name}</p>
                  {card.typeLine && (
                    <p className="text-xs text-muted-foreground truncate">{card.typeLine}</p>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold shrink-0 w-20 justify-end">
                  {destMeta.icon} {destMeta.label}
                </span>
              </button>
            );
          })}

          <div className="flex gap-2">
            <button
              onClick={removeLast}
              disabled={!canRemove}
              className="flex-1 flex items-center justify-center gap-1 h-7 text-xs border border-border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus size={11} /> Remove last
            </button>
            <button
              onClick={addCard}
              disabled={!canAdd}
              className="flex-1 flex items-center justify-center gap-1 h-7 text-xs border border-border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus size={11} /> Look at next
            </button>
          </div>
        </div>

        <Button size="sm" className="w-full" onClick={handleConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
