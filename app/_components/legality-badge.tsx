"use client";

import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface LegalityBadgeProps {
  reasons: string[];
  triggerClassName: string;
  triggerIcon: ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function LegalityBadge({
  reasons,
  triggerClassName,
  triggerIcon,
  onPointerDown,
}: LegalityBadgeProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        aria-label={`Illegal: ${reasons.join("; ")}`}
        onClick={(e) => e.stopPropagation()}
        {...(onPointerDown ? { onPointerDown } : {})}
        className={triggerClassName}
      >
        {triggerIcon}
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="font-medium mb-1.5 text-xs">Illegal in this deck</p>
        <ul className="flex flex-col gap-1 list-disc list-inside">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="text-xs text-muted-foreground leading-relaxed"
            >
              {reason}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
