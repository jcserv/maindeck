"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ChevronDown, Globe, Link2, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateDeckVisibility } from "@/app/_actions/deck/crud";
import type { Visibility } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const OPTIONS = {
  PRIVATE: {
    label: "Private",
    description: "Only you can see it",
    Icon: Lock,
  },
  UNLISTED: {
    label: "Unlisted",
    description: "Anyone with the link",
    Icon: Link2,
  },
  PUBLIC: {
    label: "Public",
    description: "Anyone can find it",
    Icon: Globe,
  },
} as const satisfies Record<
  Visibility,
  { label: string; description: string; Icon: typeof Lock }
>;

const ORDER: ReadonlyArray<Visibility> = ["PRIVATE", "UNLISTED", "PUBLIC"];

interface DeckVisibilityPickerProps {
  deckId: string;
  visibility: Visibility;
  descriptions?: Partial<Record<Visibility, string>>;
}

export function DeckVisibilityPicker({
  deckId,
  visibility,
  descriptions,
}: DeckVisibilityPickerProps) {
  const [optimistic, setOptimistic] = useOptimistic<Visibility, Visibility>(
    visibility,
    (_, next) => next,
  );
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const current = OPTIONS[optimistic];
  const { Icon } = current;

  function handleChange(next: string) {
    if (pending) return;
    const value = next as Visibility;
    if (value === optimistic) return;
    startTransition(async () => {
      setOptimistic(value);
      try {
        await updateDeckVisibility(deckId, value);
      } catch {
        // Server state is authoritative — on failure the optimistic value
        // unwinds and the stored value shows through on refresh.
      }
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-0.5 -mx-0.5",
          "text-muted-foreground hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "data-popup-open:text-foreground",
        )}
        aria-label={`Visibility: ${current.label}. Click to change.`}
      >
        <Icon className="size-3" aria-hidden />
        <span>{current.label}</span>
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup
          value={optimistic}
          onValueChange={handleChange}
        >
          {ORDER.map((value) => {
            const opt = OPTIONS[value];
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <opt.Icon className="size-3.5" aria-hidden />
                <span className="flex flex-col">
                  <span className="text-sm leading-tight">{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {descriptions?.[value] ?? opt.description}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
