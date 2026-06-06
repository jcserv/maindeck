"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Tailwind breakpoints: md=768 (2 cols), xl=1280 (3 cols), base=1 col.
const MD_QUERY = "(min-width: 768px)";
const XL_QUERY = "(min-width: 1280px)";

function subscribe(cb: () => void) {
  const md = window.matchMedia(MD_QUERY);
  const xl = window.matchMedia(XL_QUERY);
  md.addEventListener("change", cb);
  xl.addEventListener("change", cb);
  return () => {
    md.removeEventListener("change", cb);
    xl.removeEventListener("change", cb);
  };
}

function getSnapshot(): 1 | 2 | 3 {
  if (window.matchMedia(XL_QUERY).matches) return 3;
  if (window.matchMedia(MD_QUERY).matches) return 2;
  return 1;
}

// Mobile-first server snapshot keeps SSR markup matching the `columns-1` base.
function getServerSnapshot(): 1 | 2 | 3 {
  return 1;
}

function useColumnCount(): 1 | 2 | 3 {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface ColumnItem {
  key: string;
  /** Relative height estimate (e.g. card count + header) used to balance columns. */
  weight: number;
  node: ReactNode;
}

/**
 * Distributes items into `count` columns, greedily appending each to the
 * currently-shortest column. Preserves source order within each column.
 */
export function distributeColumns(
  items: ColumnItem[],
  count: number,
): ColumnItem[][] {
  const columns: ColumnItem[][] = Array.from({ length: count }, () => []);
  const heights = new Array(count).fill(0);
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < count; i++) {
      if (heights[i] < heights[target]) target = i;
    }
    columns[target]!.push(item);
    heights[target] += item.weight;
  }
  return columns;
}

/**
 * Balanced multi-column layout using explicit flex columns instead of CSS
 * `columns-*`. CSS multi-column cannot lay out incrementally — any dirtied node
 * (e.g. a hover ring) forces a full reflow + rebalance of the entire flow, which
 * is ~500ms on a 100-card deck. Explicit columns are normal block flow, so a
 * hover only relayouts its own column.
 */
export function BalancedColumns({
  items,
  className,
}: {
  items: ColumnItem[];
  className?: string;
}) {
  const count = useColumnCount();
  const columns = distributeColumns(items, count);

  return (
    <div className={cn("flex gap-x-6 items-start min-w-0", className)}>
      {columns.map((col, i) => (
        <div key={i} className="flex flex-col min-w-0 flex-1">
          {col.map((item) => (
            <div key={item.key}>{item.node}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
