"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toTitleCase } from "@/lib/utils";

interface TargetPickerProps {
  value: string | null;
  categories: string[];
  onChange: (target: string | null) => void;
}

const MAINBOARD_LABEL = "Mainboard";

/** Chooses the mainboard category that browser adds land in. `null` = uncategorized. */
export function TargetPicker({ value, categories, onChange }: TargetPickerProps) {
  const label = value ? toTitleCase(value) : MAINBOARD_LABEL;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs">
        <span className="text-muted-foreground">Add to</span>
        <span className="font-semibold">{label}</span>
        <ChevronDown className="size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <span className="flex-1">{MAINBOARD_LABEL}</span>
          {value === null && <Check className="size-3.5" aria-hidden />}
        </DropdownMenuItem>
        {categories.map((c) => (
          <DropdownMenuItem key={c} onClick={() => onChange(c)}>
            <span className="flex-1">{toTitleCase(c)}</span>
            {value === c && <Check className="size-3.5" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
