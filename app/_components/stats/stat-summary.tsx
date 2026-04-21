import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatSummaryProps {
  avgMV: number;
  landCount: number;
  expectedLands: number;
  className?: string;
}

export function StatSummary({
  avgMV,
  landCount,
  expectedLands,
  className,
}: StatSummaryProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-sm text-muted-foreground leading-relaxed",
        className,
      )}
    >
      <Info
        className="h-4 w-4 shrink-0 mt-0.5 text-primary/70"
        aria-hidden
      />
      <p>
        Your nonland cards have an average mana value of{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {avgMV.toFixed(2)}
        </span>
        . The deck contains{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {landCount}
        </span>{" "}
        land{landCount === 1 ? "" : "s"} — you&apos;ll see an average of{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {expectedLands.toFixed(1)}
        </span>{" "}
        in your opening hand.
      </p>
    </div>
  );
}
