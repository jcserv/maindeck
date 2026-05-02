import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsedDecklist } from "@/lib/deck/io/parse";

export function ParsePreview({ result }: { result: ParsedDecklist | null }) {
  if (!result) {
    return (
      <p className="text-xs text-muted-foreground leading-relaxed">
        Paste a decklist to see matched cards and unresolved lines here.
      </p>
    );
  }

  const matched = result.cards.length;
  const unmatched = result.unmatchedLines.length;
  const totalQty = result.cards.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="font-mono text-2xl font-semibold text-emerald-500 leading-none">
            {totalQty}
          </div>
          <div className="text-[10.5px] text-muted-foreground mt-1">cards total</div>
        </div>
        <div>
          <div
            className={cn(
              "font-mono text-2xl font-semibold leading-none",
              unmatched > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {unmatched}
          </div>
          <div className="text-[10.5px] text-muted-foreground mt-1">unresolved</div>
        </div>
      </div>

      <div className="text-[10.5px] text-muted-foreground">
        {matched} unique entr{matched !== 1 ? "ies" : "y"}
      </div>

      {unmatched > 0 && (
        <div className="border-t border-border pt-2">
          <div className="flex items-center gap-1 mb-1.5">
            <AlertCircle className="h-3 w-3 text-destructive" />
            <span className="text-[10.5px] font-semibold uppercase tracking-widest text-destructive font-mono">
              Won&apos;t resolve
            </span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {result.unmatchedLines.slice(0, 5).map((line, i) => (
              <li
                key={i}
                className="text-[11px] font-mono text-muted-foreground truncate"
              >
                {line}
              </li>
            ))}
            {result.unmatchedLines.length > 5 && (
              <li className="text-[11px] text-muted-foreground/60">
                +{result.unmatchedLines.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
