import { getCardTypeMeta } from "@/lib/card-types";
import { type CardType } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/utils";

interface TypeBreakdownProps {
  data: Record<string, number>;
  className?: string;
}

export function TypeBreakdown({ data, className }: TypeBreakdownProps) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const maxCount = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) {
    return (
      <div className={cn("w-full", className)}>
        <p className="text-xs font-medium text-muted-foreground mb-2">Card Types</p>
        <p className="text-xs text-muted-foreground">No cards</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <p className="text-xs font-medium text-muted-foreground mb-2">Card Types</p>
      <ul className="flex flex-col gap-1.5" role="list" aria-label="Card type breakdown">
        {entries.map(([type, count]) => {
          const meta = getCardTypeMeta(type as CardType);
          const widthPct = (count / maxCount) * 100;

          return (
            <li key={type} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-center shrink-0" aria-hidden>
                {meta.emoji}
              </span>
              <span className="w-20 shrink-0 text-muted-foreground truncate">
                {meta.label}
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{ width: `${widthPct}%` }}
                  aria-label={`${meta.label}: ${count}`}
                />
              </div>
              <span className="w-6 text-right text-muted-foreground shrink-0">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
