"use client";

import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type Density = "grid" | "list";

interface DensityToggleProps {
  value: Density;
  onChange: (density: Density) => void;
}

const OPTS: ReadonlyArray<[Density, string, typeof LayoutGrid]> = [
  ["grid", "Grid", LayoutGrid],
  ["list", "List", List],
];

export function DensityToggle({ value, onChange }: DensityToggleProps) {
  return (
    <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
      {OPTS.map(([v, label, Icon]) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "flex h-6 w-7 items-center justify-center rounded transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
