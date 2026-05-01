"use client";

import { useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { SHORTCUT_GROUPS, SHORTCUTS, type ShortcutEntry } from "./registry";

interface CheatsheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheatsheetDialog({ open, onOpenChange }: CheatsheetDialogProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ShortcutEntry[]>();
    for (const entry of SHORTCUTS) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return map;
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="All keyboard shortcuts available in maindeck"
      className="sm:max-w-2xl"
    >
      <CommandInput placeholder="Filter shortcuts…" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No matching shortcuts.</CommandEmpty>
        {SHORTCUT_GROUPS.map((group) => {
          const items = grouped.get(group);
          if (!items?.length) return null;
          return (
            <CommandGroup key={group} heading={group}>
              {items.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={`${group} ${entry.label} ${entry.keys.join(" ")}`}
                >
                  <span className="flex-1 truncate">{entry.label}</span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    {entry.keys.map((key, i) => (
                      <Kbd key={`${entry.id}-${i}`}>{key}</Kbd>
                    ))}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
