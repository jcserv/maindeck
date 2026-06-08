"use client";

import { useRef } from "react";
import Image from "next/image";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { GameChangerChip } from "@/app/_components/builder/card-row";
import type { CardSearchResult } from "@/lib/search/card-search";
import { useDeckBrowser } from "./deck-browser-context";
import { SelectCheck } from "./select-check";
import { InDeckBadge } from "./in-deck-badge";

interface DragState {
  active: boolean;
  sx: number;
  sy: number;
  moved: boolean;
  vert: boolean;
}

/**
 * Filmstrip card for the mobile Scry Tray. Tap adds (or toggles in select
 * mode); a vertical flick upward adds with a little fly-away animation, while
 * horizontal drags fall through to the strip's native scroll (`touchAction:
 * pan-x`).
 */
export function TrayCard({ card }: { card: CardSearchResult }) {
  const deck = useDeckBrowser();
  const qty = deck.countOf(card.id);
  const selected = deck.selected.has(card.id);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({
    active: false,
    sx: 0,
    sy: 0,
    moved: false,
    vert: false,
  });

  function down(e: React.PointerEvent) {
    drag.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      vert: false,
    };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    // Horizontal intent → release so the strip can scroll.
    if (!d.moved && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
      d.active = false;
      return;
    }
    if (dy < 0) {
      d.vert = true;
      d.moved = true;
      const el = ref.current;
      if (el) {
        el.style.transform = `translateY(${dy}px)`;
        el.style.opacity = String(Math.max(0.3, 1 + dy / 240));
      }
    }
  }
  function up(e: React.PointerEvent) {
    const d = drag.current;
    const el = ref.current;
    const dy = e.clientY - d.sy;
    if (d.active && d.vert && dy < -64 && !deck.selectMode) {
      if (el) {
        el.style.transition = "transform .25s ease, opacity .25s ease";
        el.style.transform = "translateY(-120px)";
        el.style.opacity = "0";
      }
      deck.add(card, 1);
      setTimeout(() => {
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
          el.style.opacity = "";
        }
      }, 260);
    } else {
      if (el) {
        el.style.transition = "transform .18s ease, opacity .18s ease";
        el.style.transform = "";
        el.style.opacity = "";
        setTimeout(() => {
          if (el) el.style.transition = "";
        }, 200);
      }
      if (!d.moved) {
        if (deck.selectMode) deck.toggleSelect(card);
        else deck.add(card, 1);
      }
    }
    drag.current.active = false;
  }

  return (
    <div
      ref={ref}
      className="group relative shrink-0 overflow-hidden rounded-xl bg-card"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={(e) => {
        if (drag.current.active) up(e);
      }}
      style={{
        width: 146,
        aspectRatio: "5 / 7",
        cursor: "pointer",
        touchAction: "pan-x",
        border: selected ? "1.5px solid var(--foreground)" : "1px solid var(--border)",
        boxShadow: selected ? "0 0 0 2px var(--foreground)" : "none",
      }}
    >
      <Image src={card.imageUri} alt={card.name} fill sizes="146px" className="object-cover" />
      <div className="absolute right-2 top-2">
        {card.manaCost && <ManaCost cost={card.manaCost} />}
      </div>
      <div className="absolute left-2 top-2 flex items-center gap-1">
        <SelectCheck card={card} />
        {!deck.selectMode && (
          <GameChangerChip format={deck.format} gameChanger={card.gameChanger} />
        )}
      </div>
      <div
        className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-4"
        style={{
          background:
            "linear-gradient(to top, color-mix(in oklab, #000 82%, transparent), transparent)",
        }}
      >
        {qty > 0 && (
          <div className="mb-1">
            <InDeckBadge qty={qty} compact />
          </div>
        )}
        <div
          className="truncate font-semibold text-white"
          style={{ fontSize: 12, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}
        >
          {card.name}
        </div>
      </div>
      {!deck.selectMode && (
        <div
          className="absolute inset-x-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
          style={{ bottom: 48 }}
        >
          <span
            className="font-mono backdrop-blur-sm"
            style={{
              fontSize: 9.5,
              color: "rgba(255,255,255,.85)",
              background: "color-mix(in oklab, #000 55%, transparent)",
              padding: "3px 7px",
              borderRadius: 99,
            }}
          >
            ↑ flick to add
          </span>
        </div>
      )}
    </div>
  );
}
