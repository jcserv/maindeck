"use client";

import { type ReactNode } from "react";
import { ArrowUpDown, ArrowUpNarrowWide, ArrowDownWideNarrow } from "lucide-react";
import { cn } from "@/lib/utils";

type SortDirection = "none" | "asc" | "desc";

interface SortToggleProps {
  value: SortDirection;
  onChange: (next: SortDirection) => void;
  label?: string;
  className?: string;
}

const CYCLE: Record<SortDirection, SortDirection> = {
  none: "asc",
  asc: "desc",
  desc: "none",
};

const ICONS: Record<SortDirection, ReactNode> = {
  none: <ArrowUpDown className="size-4" aria-hidden />,
  asc: <ArrowUpNarrowWide className="size-4" aria-hidden />,
  desc: <ArrowDownWideNarrow className="size-4" aria-hidden />,
};

const ARIA_LABELS: Record<SortDirection, string> = {
  none: "Sort: none (click to sort ascending)",
  asc: "Sort: ascending (click to sort descending)",
  desc: "Sort: descending (click to clear sort)",
};

export function SortToggle({ value, onChange, label, className }: SortToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(CYCLE[value])}
      aria-label={label ? `${label}: ${ARIA_LABELS[value]}` : ARIA_LABELS[value]}
      aria-pressed={value !== "none"}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 rounded-lg px-2.5 text-sm font-medium transition-colors",
        "border border-transparent hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        value !== "none" && "bg-muted text-foreground",
        className,
      )}
    >
      {ICONS[value]}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
