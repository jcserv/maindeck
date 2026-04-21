"use client";

import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TypeaheadTextareaProps
  extends Omit<React.ComponentProps<"textarea">, "onChange"> {
  suggest: (query: string) => Promise<string[]>;
  value: string;
  onChange: (value: string) => void;
}

// Extracts the "search part" of a line — strips leading quantity like "4 " or "4x "
function extractSearchPart(line: string): { prefix: string; search: string } {
  const match = line.match(/^(\d+x?\s+)(.*)$/i);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { prefix: match[1], search: match[2] };
  }
  return { prefix: "", search: line };
}

export function TypeaheadTextarea({
  suggest,
  value,
  onChange,
  className,
  ...props
}: TypeaheadTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [currentLinePrefix, setCurrentLinePrefix] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute current line info from caret position
  function getCurrentLineInfo() {
    const el = textareaRef.current;
    if (!el) return null;
    const pos = el.selectionStart ?? 0;
    const text = el.value;
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    const lineEnd = text.indexOf("\n", pos);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const { prefix, search } = extractSearchPart(line);
    return { lineStart, prefix, search };
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);

    const info = getCurrentLineInfo();
    if (!info) return;

    const { prefix, search } = info;
    setCurrentLinePrefix(prefix);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await suggest(search);
        setSuggestions(results.slice(0, 8));
        setOpen(results.length > 0);
        setHighlightedIndex(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 200);
  }

  function applySuggestion(suggestion: string) {
    const el = textareaRef.current;
    if (!el) return;

    const text = el.value;
    // Find the current line boundaries (re-compute at apply time)
    const pos = el.selectionStart ?? 0;
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    const lineEnd = text.indexOf("\n", pos);
    const after = lineEnd === -1 ? "" : text.slice(lineEnd);

    const newLine = currentLinePrefix + suggestion;
    const newText = text.slice(0, lineStart) + newLine + after;
    onChange(newText);

    // Place caret at end of the new line
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const newPos = lineStart + newLine.length;
      textareaRef.current.selectionStart = newPos;
      textareaRef.current.selectionEnd = newPos;
      textareaRef.current.focus();
    });

    setOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if ((e.key === "Enter" || e.key === "Tab") && highlightedIndex >= 0) {
      e.preventDefault();
      const pick = suggestions[highlightedIndex];
      if (pick) applySuggestion(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  // Click-outside to dismiss
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={className}
        {...props}
      />
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Suggestions"
          className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md py-1 text-sm text-popover-foreground"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlightedIndex}
              onPointerDown={(e) => {
                // Prevent blur before we can apply
                e.preventDefault();
                applySuggestion(s);
              }}
              className={cn(
                "px-3 py-2 cursor-pointer min-h-11 flex items-center",
                i === highlightedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
