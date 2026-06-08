"use client";

import { Check, X } from "lucide-react";

interface InDeckBadgeProps {
  qty: number;
  compact?: boolean;
}

/** "N in deck" pill shown on results already present in the open deck. */
export function InDeckBadge({ qty, compact }: InDeckBadgeProps) {
  if (!qty) return null;
  return (
    <span
      title={`${qty} in deck`}
      className="font-mono inline-flex items-center gap-1 rounded-[5px] px-1.5 font-semibold whitespace-nowrap"
      style={{
        height: compact ? 17 : 19,
        fontSize: 10,
        background: "color-mix(in oklab, var(--foreground) 88%, transparent)",
        color: "var(--background)",
        letterSpacing: "0.02em",
      }}
    >
      <Check className="size-2.5" strokeWidth={3.2} aria-hidden />
      {qty}
      {compact ? "" : " in deck"}
    </span>
  );
}

/** Small square badge marking a result that is illegal in the deck's format. */
export function IllegalBadge({ reasons }: { reasons?: string[] }) {
  return (
    <span
      title={
        reasons && reasons.length > 0
          ? reasons.join("; ")
          : "Not legal in this deck's format"
      }
      className="inline-flex items-center justify-center rounded-[4px] text-destructive"
      style={{
        width: 18,
        height: 18,
        background: "color-mix(in oklab, var(--destructive) 14%, transparent)",
        border: "1px solid color-mix(in oklab, var(--destructive) 30%, transparent)",
      }}
    >
      <X className="size-2.5" strokeWidth={2.6} aria-hidden />
    </span>
  );
}
