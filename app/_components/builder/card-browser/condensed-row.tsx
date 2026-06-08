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

/** Dense list row used by the panel's "list" density. */
export function CondensedRow({ card }: { card: CardSearchResult }) {
  const deck = useDeckBrowser();
  const qty = deck.countOf(card.id);
  const selected = deck.selected.has(card.id);
  const { legal, reasons } = deck.legalityOf(card);

  return (
    <div
      className={cn(
        "group anim-fade flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5",
        selected ? "bg-muted ring-1 ring-border" : "hover:bg-muted",
      )}
      onClick={() => deck.selectMode && deck.toggleSelect(card)}
    >
      {deck.selectMode && <SelectCheck card={card} />}
      <div className="relative h-12 w-[34px] shrink-0 overflow-hidden rounded border border-border">
        <Image src={card.imageUri} alt="" fill sizes="34px" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{card.name}</span>
          <GameChangerChip format={deck.format} gameChanger={card.gameChanger} />
          {!legal && <IllegalBadge reasons={reasons} />}
        </div>
        {card.typeLine && (
          <div className="truncate font-mono text-[10.5px] text-muted-foreground">
            {card.typeLine}
          </div>
        )}
      </div>
      {card.manaCost && <ManaCost cost={card.manaCost} className="shrink-0" />}
      {qty > 0 && (
        <div className="shrink-0">
          <InDeckBadge qty={qty} compact />
        </div>
      )}
      {!deck.selectMode && (
        <div className="shrink-0">
          <AddControls card={card} size="sm" />
        </div>
      )}
    </div>
  );
}
