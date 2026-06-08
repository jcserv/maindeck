"use client";

import Image from "next/image";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { GameChangerChip } from "@/app/_components/builder/card-row";
import type { CardSearchResult } from "@/lib/search/card-search";
import { cn } from "@/lib/utils";
import { useDeckBrowser } from "./deck-browser-context";
import { AddControls } from "./add-controls";
import { SelectCheck } from "./select-check";
import { InDeckBadge, IllegalBadge } from "./in-deck-badge";

/** Grid tile: real card art with overlaid name/type/mana and hover add controls. */
export function BrowserCard({ card }: { card: CardSearchResult }) {
  const deck = useDeckBrowser();
  const qty = deck.countOf(card.id);
  const selected = deck.selected.has(card.id);
  const { legal, reasons } = deck.legalityOf(card);

  return (
    <div
      className={cn(
        "group anim-fade relative cursor-pointer overflow-hidden rounded-xl bg-card transition-transform",
        selected
          ? "ring-2 ring-foreground"
          : "border border-border hover:-translate-y-0.5",
      )}
      style={{ aspectRatio: "5 / 7" }}
      onClick={() =>
        deck.selectMode ? deck.toggleSelect(card) : deck.add(card, 1)
      }
    >
      <Image
        src={card.imageUri}
        alt={card.name}
        fill
        sizes="200px"
        className="object-cover"
      />
      {/* top controls */}
      <div className="absolute left-2 top-2 flex items-center gap-1">
        <SelectCheck card={card} />
        {!deck.selectMode && (
          <GameChangerChip format={deck.format} gameChanger={card.gameChanger} />
        )}
        {!deck.selectMode && !legal && <IllegalBadge reasons={reasons} />}
      </div>
      {card.manaCost && (
        <div className="absolute right-2 top-2">
          <ManaCost cost={card.manaCost} />
        </div>
      )}
      {/* bottom name plate */}
      <div
        className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-5"
        style={{
          background:
            "linear-gradient(to top, color-mix(in oklab, #000 80%, transparent), transparent)",
        }}
      >
        {qty > 0 && (
          <div className="mb-1">
            <InDeckBadge qty={qty} compact />
          </div>
        )}
        <div
          className="truncate font-semibold text-white"
          style={{ fontSize: 12.5, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}
        >
          {card.name}
        </div>
        {card.typeLine && (
          <div
            className="truncate font-mono text-white/60"
            style={{ fontSize: 9.5, marginTop: 2 }}
          >
            {card.typeLine}
          </div>
        )}
      </div>
      {/* hover add */}
      {!deck.selectMode && (
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: "color-mix(in oklab, #000 28%, transparent)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <AddControls card={card} />
        </div>
      )}
    </div>
  );
}
