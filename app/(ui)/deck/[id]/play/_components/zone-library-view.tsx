"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { ActionSheet } from "./action-sheet";
import type { PlaytestCard, PlaytestZone } from "../playtest-reducer";

const ZONE_LABELS: Record<PlaytestZone, string> = {
  library: "Library",
  hand: "Hand",
  battlefield: "Battlefield",
  graveyard: "Graveyard",
  exile: "Exile",
};

interface ZoneLibraryViewProps {
  zone: PlaytestZone;
  cards: PlaytestCard[];
  onClose: () => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
}

export function ZoneLibraryView({ zone, cards, onClose, onSendTo }: ZoneLibraryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [hovered, setHovered] = useState<PlaytestCard | null>(null);
  const [selected, setSelected] = useState<PlaytestCard | null>(null);

  const filteredCards = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return cards;

    if (q.startsWith("t:")) {
      const typeQ = q.slice(2);
      return cards.filter((c) => c.typeLine?.toLowerCase().includes(typeQ) ?? false);
    }

    const numericCmc = /^\d+$/.test(q) ? Number(q) : null;

    return cards.filter((c) => {
      if (numericCmc !== null && c.cmc === numericCmc) return true;
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.typeLine?.toLowerCase().includes(q)) return true;
      if (c.manaCost?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [cards, searchTerm]);

  const previewCard = hovered ?? (filteredCards.length === 1 ? filteredCards[0] : null);

  return (
    <>
      <div className="w-72 h-full flex flex-col border-l border-border bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-sm font-semibold">
            {ZONE_LABELS[zone]} · {cards.length}
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview */}
        <div className="h-[200px] shrink-0 flex items-center justify-center bg-muted/30 border-b border-border">
          {previewCard?.imageUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewCard.imageUri}
              alt={previewCard.name}
              className="h-full object-contain"
              draggable={false}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {previewCard ? previewCard.name : "Hover to preview"}
            </span>
          )}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2 rounded border border-input bg-background px-2 py-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="name, t:creature, cmc…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto">
          {filteredCards.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No results</p>
          ) : (
            filteredCards.map((card) => (
              <div
                key={card.instanceId}
                className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/50"
                onMouseEnter={() => setHovered(card)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(card)}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{card.name}</div>
                  {card.typeLine && (
                    <div className="truncate text-muted-foreground">{card.typeLine}</div>
                  )}
                </div>
                {card.manaCost && (
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                    {card.manaCost}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <ActionSheet
        card={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onSendTo={(id, z) => {
          onSendTo(id, z);
          setSelected(null);
        }}
      />
    </>
  );
}
