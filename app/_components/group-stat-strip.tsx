"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  computeManaCurveRaw,
  computeColorPipsRaw,
  computeAverageMVRaw,
  type DeckCardWithRelations,
} from "@/lib/stats/compute";

interface GroupStatStripProps {
  cards: DeckCardWithRelations[];
  className?: string;
}

const CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"] as const;

const COLOR_ORDER = ["W", "U", "B", "R", "G", "C"] as const;
type ColorKey = (typeof COLOR_ORDER)[number];

const COLOR_SLUG: Record<ColorKey, string> = {
  W: "w",
  U: "u",
  B: "b",
  R: "r",
  G: "g",
  C: "c",
};

const COLOR_LABEL: Record<ColorKey, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

/**
 * Compact single-row stat strip for a grouped section of the decklist.
 * Shows: card count · avg MV · mini mana curve · color pips.
 * Consumes a pre-scoped DeckCardWithRelations[] (already zone-filtered by the caller).
 */
export function GroupStatStrip({ cards, className }: GroupStatStripProps) {
  const stats = useMemo(() => {
    const count = cards.reduce((sum, dc) => sum + dc.quantity, 0);
    const avgMV = computeAverageMVRaw(cards);
    const curve = computeManaCurveRaw(cards);
    const pips = computeColorPipsRaw(cards);
    const curveMax = Math.max(...CURVE_BUCKETS.map((b) => curve[b] ?? 0), 1);
    const totalPips = COLOR_ORDER.reduce((sum, k) => sum + pips[k], 0);
    return { count, avgMV, curve, pips, curveMax, totalPips };
  }, [cards]);

  if (stats.count === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 text-[10px] text-muted-foreground select-none",
        className,
      )}
      aria-label="Group statistics"
    >
      {/* Card count */}
      <span className="tabular-nums font-medium">{stats.count}</span>

      {/* Avg MV — hidden for pure-land sections */}
      {stats.avgMV > 0 && (
        <span className="tabular-nums" title="Average mana value">
          avg {stats.avgMV.toFixed(1)}
        </span>
      )}

      {/* Mini mana curve */}
      <MiniCurve curve={stats.curve} curveMax={stats.curveMax} />

      {/* Color pips */}
      {stats.totalPips > 0 && (
        <ColorPips pips={stats.pips} totalPips={stats.totalPips} />
      )}
    </div>
  );
}

interface MiniCurveProps {
  curve: Record<string, number>;
  curveMax: number;
}

function MiniCurve({ curve, curveMax }: MiniCurveProps) {
  return (
    <div
      className="flex items-end gap-px h-[14px]"
      role="img"
      aria-label="Mini mana curve"
    >
      {CURVE_BUCKETS.map((bucket) => {
        const count = curve[bucket] ?? 0;
        const heightPct = (count / curveMax) * 100;
        return (
          <div
            key={bucket}
            className={cn(
              "w-1.5 rounded-[1px] transition-all",
              count > 0 ? "bg-primary/50" : "bg-border/40",
            )}
            style={{ height: `${Math.max(heightPct, count > 0 ? 15 : 10)}%` }}
            aria-label={`MV ${bucket}: ${count}`}
          />
        );
      })}
    </div>
  );
}

interface ColorPipsProps {
  pips: Record<ColorKey, number>;
  totalPips: number;
}

function ColorPips({ pips, totalPips }: ColorPipsProps) {
  const active = COLOR_ORDER.filter((k) => pips[k] > 0);

  if (active.length === 0) return null;

  return (
    <span
      className="flex items-center gap-0.5"
      aria-label="Color distribution"
    >
      {active.map((color) => {
        const pct = Math.round((pips[color] / totalPips) * 100);
        return (
          <span
            key={color}
            className="flex items-center gap-0.5"
            title={`${COLOR_LABEL[color]}: ${pct}%`}
          >
            <i
              className={cn("ms", `ms-${COLOR_SLUG[color]}`, "ms-cost")}
              aria-hidden
            />
          </span>
        );
      })}
    </span>
  );
}
