"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LayoutGrid } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeckSearch } from "@/app/_components/builder/deck-search-context";
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
  const { registerInput, deckRoute } = useHeaderSearch();
  const search = useDeckSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // The owner-only Browse button is client-only — the server never renders it
  // (deckRoute is seeded by DeckRouteBridge's layout effect). That layout
  // effect can flush mid-hydration and set deckRoute before this bar finishes
  // hydrating, so rendering the button off deckRoute alone mismatches the
  // server HTML. Gate it on a post-hydration flag (false on the server and
  // through the hydration pass, true after) so the hydration render always
  // matches the server (no button); the button appears on the next pass.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Register the static input so global ⌘K / "/" shortcuts can focus it.
  // Focus then triggers onActivate, which swaps in the heavy component.
  useEffect(() => {
    return registerInput(inputRef.current) ?? undefined;
  }, [registerInput]);

  return (
    <div className="relative w-full md:w-[360px] lg:w-[440px]">
      <div className="flex items-center gap-2 h-[36px] px-2.5 rounded-md border border-input bg-muted/40 text-sm focus-within:bg-background focus-within:ring-1 focus-within:ring-ring transition-colors">
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
        {hydrated && deckRoute?.isOwner && (
          // Opening the card browser only flips DeckSearchContext state, so we
          // can offer it from the lightweight resting bar without loading the
          // heavy search chunk (which still defers until the input is focused).
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-label="Browse cards"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => search?.requestBrowse()}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <LayoutGrid className="size-3.5" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>Open card browser</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Kbd className="hidden md:inline-flex shrink-0">⌘K</Kbd>
      </div>
    </div>
  );
}
