import { cn } from "@/lib/utils";

interface ColorPipsProps {
  data: { W: number; U: number; B: number; R: number; G: number; C: number };
  className?: string;
}

const COLOR_CONFIG = {
  W: { label: "White", slug: "w" },
  U: { label: "Blue", slug: "u" },
  B: { label: "Black", slug: "b" },
  R: { label: "Red", slug: "r" },
  G: { label: "Green", slug: "g" },
  C: { label: "Colorless", slug: "c" },
} as const;

type ColorKey = keyof typeof COLOR_CONFIG;
const ORDER: ColorKey[] = ["W", "U", "B", "R", "G", "C"];

export function ColorPie({ data, className }: ColorPipsProps) {
  const total = ORDER.reduce((sum, k) => sum + data[k], 0);

  return (
    <div className={cn("w-full", className)}>
      <p className="text-xs font-medium text-muted-foreground mb-3">Color Pips</p>
      {total === 0 ? (
        <div className="flex items-center justify-center h-[80px] text-xs text-muted-foreground">
          No colored pips
        </div>
      ) : (
        <ul
          className="grid grid-cols-6 gap-2"
          role="list"
          aria-label="Color pip distribution"
        >
          {ORDER.map((color) => {
            const value = data[color];
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            const cfg = COLOR_CONFIG[color];
            const isActive = value > 0;
            return (
              <li
                key={color}
                className="flex flex-col items-center gap-1.5"
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 shrink-0",
                    !isActive && "opacity-40",
                  )}
                  aria-hidden
                  title={`${cfg.label}: ${Math.round(value)} pips (${pct}%)`}
                >
                  <i
                    className={cn("ms", `ms-${cfg.slug}`, "ms-cost", "ms-2x")}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums leading-none">
                  {pct}%
                </span>
                <span className="text-[10px] text-muted-foreground leading-none text-center">
                  {cfg.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
