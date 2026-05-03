"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Keyboard } from "lucide-react";
import { fireDeckAction } from "@/app/_components/hotkeys/deck-actions-bus";
import {
  type ShortcutEntry,
} from "@/app/_components/hotkeys/registry";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export type ShortcutNavItem =
  | { kind: "entry"; entry: ShortcutEntry }
  | { kind: "toggle" };

export function visibleShortcutCount(
  relevantLen: number,
  otherLen: number,
  expanded: boolean,
): number {
  if (otherLen === 0) return relevantLen;
  return relevantLen + 1 + (expanded ? otherLen : 0);
}

export function shortcutNavAt(
  relevant: ShortcutEntry[],
  other: ShortcutEntry[],
  expanded: boolean,
  index: number,
): ShortcutNavItem | null {
  if (index < 0) return null;
  if (index < relevant.length) {
    const entry = relevant[index];
    return entry ? { kind: "entry", entry } : null;
  }
  if (other.length === 0) return null;
  const toggleIdx = relevant.length;
  if (index === toggleIdx) return { kind: "toggle" };
  if (!expanded) return null;
  const j = index - toggleIdx - 1;
  const entry = other[j];
  return entry ? { kind: "entry", entry } : null;
}

export function triggerShortcut(
  entry: ShortcutEntry,
  router: ReturnType<typeof useRouter>,
): boolean {
  switch (entry.id) {
    case "global.new":
      router.push("/deck/new");
      return true;
    case "nav.decks":
      router.push("/decks");
      return true;
    case "nav.home":
      router.push("/");
      return true;
    case "deck.bulkEdit":
      return fireDeckAction("bulk-edit");
    case "deck.export":
      return fireDeckAction("export");
    case "deck.toggleView":
      return fireDeckAction("toggle-view");
    default:
      return false;
  }
}

interface ShortcutsViewProps {
  relevant: ShortcutEntry[];
  other: ShortcutEntry[];
  expanded: boolean;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onPickEntry: (entry: ShortcutEntry) => void;
  onToggleOther: () => void;
}

function ShortcutEntryRow({
  entry,
  active,
  onHover,
  onPick,
}: {
  entry: ShortcutEntry;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <ItemButton active={active} onHover={onHover} onPick={onPick}>
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate">{entry.label}</span>
        <span className="text-xs text-muted-foreground truncate">
          {entry.group}
        </span>
      </div>
      <span className="ml-auto inline-flex items-center gap-1 shrink-0">
        {entry.keys.map((key, idx) => (
          <Kbd key={`${entry.id}-${idx}`}>{key}</Kbd>
        ))}
      </span>
    </ItemButton>
  );
}

export function ShortcutsView({
  relevant,
  other,
  expanded,
  activeIndex,
  setActiveIndex,
  onPickEntry,
  onToggleOther,
}: ShortcutsViewProps) {
  const empty = relevant.length === 0 && other.length === 0;
  const showToggle = other.length > 0;
  const toggleIndex = relevant.length;
  return (
    <>
      <div className="px-3 py-2 text-xs border-b bg-muted/40 flex items-center gap-2">
        <Keyboard className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium">Keyboard shortcuts</span>
      </div>
      <div className="max-h-80 overflow-y-auto p-1">
        {empty ? (
          <div className="py-4 px-3 text-sm text-muted-foreground">
            No matching shortcuts.
          </div>
        ) : (
          <>
            {relevant.map((entry, i) => (
              <ShortcutEntryRow
                key={`s-${entry.id}`}
                entry={entry}
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onPick={() => onPickEntry(entry)}
              />
            ))}
            {showToggle && (
              <ItemButton
                active={toggleIndex === activeIndex}
                onHover={() => setActiveIndex(toggleIndex)}
                onPick={onToggleOther}
              >
                <span className="inline-flex items-center gap-1.5 text-sm">
                  {expanded ? (
                    <ChevronDown className="size-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3.5" aria-hidden />
                  )}
                  {expanded ? "Hide other shortcuts" : "Show all shortcuts"}
                </span>
              </ItemButton>
            )}
            {showToggle && expanded && (
              <>
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Other shortcuts
                </div>
                {other.map((entry, j) => {
                  const i = toggleIndex + 1 + j;
                  return (
                    <ShortcutEntryRow
                      key={`o-${entry.id}`}
                      entry={entry}
                      active={i === activeIndex}
                      onHover={() => setActiveIndex(i)}
                      onPick={() => onPickEntry(entry)}
                    />
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
      <FooterHint mode="shortcuts" />
    </>
  );
}

export function ItemButton({
  children,
  active,
  disabled,
  onHover,
  onPick,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      aria-disabled={disabled}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm min-h-10",
        active && !disabled && "bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

export function FooterHint({
  mode,
}: {
  mode: "list" | "destination" | "shortcuts" | "more";
}) {
  return (
    <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t flex items-center gap-2 flex-wrap">
      <Kbd>↵</Kbd>
      <span>{mode === "destination" ? "confirms" : "selects"}</span>
      <span className="mx-1">·</span>
      {mode === "list" ? (
        <>
          <Kbd>⇧↵</Kbd>
          <span>quick add</span>
          <span className="mx-1">·</span>
        </>
      ) : mode === "more" ? (
        <>
          <Kbd>⇧↵</Kbd>
          <span>quick add</span>
          <span className="mx-1">·</span>
          <Kbd>⌫</Kbd>
          <span>back</span>
          <span className="mx-1">·</span>
        </>
      ) : (
        <>
          <Kbd>⌫</Kbd>
          <span>back</span>
          <span className="mx-1">·</span>
        </>
      )}
      <Kbd>Esc</Kbd>
      <span>{mode === "list" ? "closes" : "back"}</span>
    </div>
  );
}
