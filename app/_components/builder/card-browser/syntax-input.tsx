"use client";

import { ScanSearch } from "lucide-react";

interface SyntaxInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Raw Scryfall-syntax text box (the syntax tab's single source of truth). */
export function SyntaxInput({
  value,
  onChange,
  placeholder = 'c:U t:creature cmc<=3 o:"flying"',
  autoFocus,
}: SyntaxInputProps) {
  return (
    <div className="relative">
      <ScanSearch
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Scryfall syntax query"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 font-mono text-[13.5px] outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
