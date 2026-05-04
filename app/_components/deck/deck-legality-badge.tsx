"use client";

import { Check, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { LegalityIssue } from "@/lib/deck/legality";
import { formatLegalityIssue } from "@/lib/deck/legality/shared";

interface DeckLegalityBadgeProps {
  legal: boolean;
  issues: LegalityIssue[];
}

export function DeckLegalityBadge({ legal, issues }: DeckLegalityBadgeProps) {
  if (legal) {
    return (
      <span
        aria-label="Deck is legal"
        className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
      >
        <Check className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Legal</span>
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        className="inline-flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
        aria-label={`Deck has ${issues.length} legality issue${issues.length !== 1 ? "s" : ""}`}
      >
        <X className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Illegal</span>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <p className="font-medium mb-2 text-sm">Legality issues</p>
        <ul className="flex flex-col gap-1.5 list-disc list-inside">
          {issues.map((issue, index) => (
            <li key={`${issue.kind}-${index}`} className="text-xs text-muted-foreground leading-relaxed">
              {formatLegalityIssue(issue)}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
