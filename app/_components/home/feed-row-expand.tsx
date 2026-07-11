"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function FeedRowExpand({
  deckName,
  summary,
  children,
}: {
  deckName: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{summary}</span>
        <CollapsibleTrigger
          className="relative shrink-0 rounded-sm p-0.5 hover:bg-muted hover:text-foreground transition-colors"
          aria-label={`${open ? "Hide" : "Show"} changes to ${deckName}`}
        >
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </CollapsibleTrigger>
      </div>
      <CollapsiblePanel className="relative">
        <div className="pt-2">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
