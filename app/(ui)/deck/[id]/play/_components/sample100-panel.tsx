"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { runSample100, type Sample100Result } from "../sample100";
import type { PlaytestCard } from "../playtest-reducer";

interface Sample100PanelProps {
  cards: PlaytestCard[];
  categories: string[];
  seed: number;
  className?: string;
}

export function Sample100Panel({ cards, categories, seed, className }: Sample100PanelProps) {
  const [result, setResult] = useState<Sample100Result | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRun = () => {
    startTransition(() => {
      const r = runSample100(cards, categories, seed);
      setResult(r);
    });
  };

  return (
    <div className={cn("flex flex-col gap-3 p-3 overflow-y-auto", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Sample 100×
        </span>
        <Button size="sm" variant="outline" className="text-xs h-6" onClick={handleRun} disabled={isPending}>
          {isPending ? "Running…" : "Run 100×"}
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Keep rate</span>
            <span className="font-semibold tabular-nums">
              {Math.round(result.keepRate * 100)}%
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Mana distribution</span>
            <div className="flex items-center justify-between text-xs">
              <span>Mean lands</span>
              <span className="tabular-nums">{result.manaStats.mean.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>σ</span>
              <span className="tabular-nums">{result.manaStats.stddev.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>0-land</span>
              <span className="tabular-nums">{Math.round(result.manaStats.zero * 100)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>1-land</span>
              <span className="tabular-nums">{Math.round(result.manaStats.one * 100)}%</span>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">P(hit by turn 3)</span>
              {categories.map((cat) => {
                const pct = Math.round((result.categoryHitByTurn3[cat] ?? 0) * 100);
                return (
                  <div key={cat} className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="truncate">{cat}</span>
                      <span className="tabular-nums ml-2">{pct}%</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.sampleKeep && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Sample keep</span>
              <div className="flex flex-wrap gap-1">
                {result.sampleKeep.map((c, i) => (
                  <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[100px]">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.sampleMull && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Sample mull</span>
              <div className="flex flex-wrap gap-1">
                {result.sampleMull.map((c, i) => (
                  <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[100px] opacity-60">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !isPending && (
        <p className="text-xs text-muted-foreground">
          Simulate 100 opening hands to see keep rate, mana curve, and category hit probability.
        </p>
      )}
    </div>
  );
}
