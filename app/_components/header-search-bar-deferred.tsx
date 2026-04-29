"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { useHeaderSearch } from "./header-search-context";

const HeaderSearchBarLazy = lazy(() =>
  import("./header-search-bar").then((m) => ({ default: m.HeaderSearchBar })),
);

export function HeaderSearchBar() {
  const [activated, setActivated] = useState(false);

  if (activated) {
    return (
      <Suspense fallback={<RestingInput onActivate={() => {}} />}>
        <ActivatedBar />
      </Suspense>
    );
  }

  return <RestingInput onActivate={() => setActivated(true)} />;
}

// After the heavy chunk loads, focus the new input — it was deactivated when
// the resting fallback unmounted during the Suspense swap.
function ActivatedBar() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("input")?.focus();
  }, []);
  return (
    <div ref={ref} className="contents">
      <HeaderSearchBarLazy />
    </div>
  );
}

function RestingInput({ onActivate }: { onActivate: () => void }) {
  const { registerInput } = useHeaderSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // Register the static input so global ⌘K / "/" shortcuts can focus it.
  // Focus then triggers onActivate, which swaps in the heavy component.
  useEffect(() => {
    return registerInput(inputRef.current) ?? undefined;
  }, [registerInput]);

  return (
    <div className="relative w-full md:w-[360px] lg:w-[440px]">
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-md border border-input bg-muted/40 text-sm focus-within:bg-background focus-within:ring-1 focus-within:ring-ring transition-colors">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 text-muted-foreground"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          aria-label="Search cards"
          placeholder="Search cards…"
          onFocus={onActivate}
          onMouseDown={onActivate}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <Kbd className="hidden md:inline-flex shrink-0">⌘K</Kbd>
      </div>
    </div>
  );
}
