"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type ManaColor = "w" | "u" | "b" | "r" | "g" | "c";

const COLORS: ManaColor[] = ["w", "u", "b", "r", "g", "c"];

const LABELS: Record<ManaColor, string> = {
  w: "White",
  u: "Blue",
  b: "Black",
  r: "Red",
  g: "Green",
  c: "Colorless",
};

type Pool = Record<ManaColor, number>;

const EMPTY: Pool = { w: 0, u: 0, b: 0, r: 0, g: 0, c: 0 };

export function ManaPool() {
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<Pool>({ ...EMPTY });

  const add = (color: ManaColor) =>
    setPool((p) => ({ ...p, [color]: p[color] + 1 }));

  const sub = (color: ManaColor) =>
    setPool((p) => ({ ...p, [color]: Math.max(0, p[color] - 1) }));

  const total = COLORS.reduce((n, c) => n + pool[c], 0);

  return (
    <div className="flex flex-col gap-1">
      {open && (
        <div className="flex flex-col gap-0.5 pb-1">
          {COLORS.map((color) => (
            <div key={color} className="flex items-center justify-center gap-1.5">
              <i
                className={cn("ms", `ms-${color}`, "ms-cost")}
                aria-label={LABELS[color]}
              />
              <button
                className="w-5 h-5 rounded border border-border text-xs hover:bg-muted transition-colors shrink-0"
                onClick={() => sub(color)}
                aria-label={`Remove ${LABELS[color]} mana`}
              >
                −
              </button>
              <span className="tabular-nums text-xs w-4 text-center">
                {pool[color]}
              </span>
              <button
                className="w-5 h-5 rounded border border-border text-xs hover:bg-muted transition-colors shrink-0"
                onClick={() => add(color)}
                aria-label={`Add ${LABELS[color]} mana`}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className="flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted text-left transition-colors w-full"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-medium">Mana Pool</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {total > 0 && (
            <span className="tabular-nums text-xs">{total}</span>
          )}
          {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </span>
      </button>
    </div>
  );
}
