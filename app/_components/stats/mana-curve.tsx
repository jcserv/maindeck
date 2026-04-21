import { cn } from "@/lib/utils";

interface ManaCurveProps {
  data: Record<string, number>;
  className?: string;
}

const BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"];

function niceTicks(max: number): number[] {
  const target = Math.max(1, Math.ceil(max));
  const step = Math.max(1, Math.ceil(target / 4));
  return [0, step, step * 2, step * 3, step * 4];
}

export function ManaCurve({ data, className }: ManaCurveProps) {
  const rawMax = Math.max(...BUCKETS.map((b) => data[b] ?? 0), 1);
  const ticks = niceTicks(rawMax);
  const chartMax = ticks[ticks.length - 1] ?? 1;

  return (
    <div className={cn("w-full", className)}>
      <p className="text-xs font-medium text-muted-foreground mb-3">Mana Curve</p>
      <div className="flex gap-2">
        {/* Y-axis ticks */}
        <div className="flex flex-col justify-between h-[200px] py-0 text-[10px] text-muted-foreground tabular-nums pr-1">
          {[...ticks].reverse().map((t) => (
            <span key={t} className="leading-none">
              {t}
            </span>
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col">
          <div
            className="relative flex items-end justify-between gap-2 h-[200px] border-l border-b border-border/60"
            role="img"
            aria-label="Mana curve bar chart"
          >
            {/* Horizontal gridlines */}
            {ticks.slice(1).map((t) => (
              <div
                key={t}
                className="absolute left-0 right-0 border-t border-border/20"
                style={{ bottom: `${(t / chartMax) * 100}%` }}
                aria-hidden
              />
            ))}

            {BUCKETS.map((bucket) => {
              const count = data[bucket] ?? 0;
              const heightPct = (count / chartMax) * 100;
              return (
                <div
                  key={bucket}
                  className="relative flex-1 min-w-0 flex items-end justify-center h-full"
                >
                  {count > 0 && (
                    <span
                      className="absolute text-[10px] text-muted-foreground tabular-nums leading-none"
                      style={{ bottom: `calc(${heightPct}% + 4px)` }}
                    >
                      {count}
                    </span>
                  )}
                  <div
                    className="w-full max-w-10 rounded-t-sm bg-primary/70 transition-all"
                    style={{ height: `${heightPct}%` }}
                    aria-label={`CMC ${bucket}: ${count} cards`}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between gap-2 mt-1 ml-[1px]">
            {BUCKETS.map((bucket) => (
              <span
                key={bucket}
                className="flex-1 text-center text-[10px] text-muted-foreground tabular-nums"
              >
                {bucket}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-1">
            Mana Value
          </p>
        </div>
      </div>
    </div>
  );
}
