"use client";

import { cn } from "@/lib/utils";

/** WUBRG swatch colors, matching the mana-font palette used across the app. */
const SWATCH: Record<string, { bg: string; bd: string; fg: string }> = {
  W: { bg: "#f8f0d1", bd: "#d8c98a", fg: "#7a6c3a" },
  U: { bg: "#0e68ab", bd: "#0a4f81", fg: "#ffffff" },
  B: { bg: "#1a1512", bd: "#000000", fg: "#cdc5be" },
  R: { bg: "#d3202a", bd: "#9b1820", fg: "#ffffff" },
  G: { bg: "#00733e", bd: "#005529", fg: "#ffffff" },
};

interface ColorPipProps {
  color: string;
  active: boolean;
  onClick: () => void;
  size?: number;
}

export function ColorPip({ color, active, onClick, size = 28 }: ColorPipProps) {
  const sw = SWATCH[color] ?? SWATCH["W"]!;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Color ${color}`}
      className={cn(
        "font-mono rounded-full transition-all",
        active
          ? "opacity-100 ring-2 ring-foreground ring-offset-1 ring-offset-background"
          : "opacity-40 hover:opacity-70",
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        fontWeight: 600,
        background: sw.bg,
        color: sw.fg,
        border: `1.5px solid ${sw.bd}`,
      }}
    >
      {color}
    </button>
  );
}
