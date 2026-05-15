"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Keyboard,
  Search as SearchIcon,
  X as XIcon,
} from "lucide-react";
import {
  useHeaderSearch,
} from "@/app/_components/header-search/header-search-context";
import {
  partitionShortcuts,
  type ShortcutEntry,
} from "@/app/_components/hotkeys/registry";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { Kbd } from "@/components/ui/kbd";
import { parseAddCardInput } from "@/lib/deck/add-intent";
import type { CardSearchResult } from "@/lib/search/card-search";
import { cn, toNameSlug } from "@/lib/utils";
import {
  ShortcutsView,
  shortcutNavAt,
  triggerShortcut,
  visibleShortcutCount,
  type ShortcutNavItem,
} from "./shared";

interface MyDeck {
  id: string;
  name: string;
  format: string;
}

export function SimpleBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { registerInput, shortcutsTick, deckRoute } = useHeaderSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [myDecks, setMyDecks] = useState<MyDeck[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<"list" | "shortcuts">("list");
  const [showOther, setShowOther] = useState(false);

  // Reset disclosure state on view change so re-entering shortcuts starts collapsed.
  if (view !== "shortcuts" && showOther) setShowOther(false);

  // External "show shortcuts" requests (e.g. `?` hotkey) jump straight into
  // the shortcuts view.
  const [prevTick, setPrevTick] = useState(shortcutsTick);
  if (shortcutsTick !== prevTick) {
    setPrevTick(shortcutsTick);
    if (shortcutsTick > 0) {
      setView("shortcuts");
      setOpen(true);
      setQuery("");
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    return registerInput(inputRef.current) ?? undefined;
  }, [registerInput]);

  // Fetch the user's decks once on mount for deck-nav / create-deck affordances
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/decks/mine");
        if (!res.ok) return;
        const data = (await res.json()) as { decks: MyDeck[] };
        if (!cancelled && Array.isArray(data.decks)) setMyDecks(data.decks);
      } catch {
        // unauthenticated or network error — leave empty
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Sync results/loading to the debounced term during render — the effect below
  // performs the actual fetch, but loading state is owned by render to avoid
  // setState-in-effect.
  const [prevDebounced, setPrevDebounced] = useState(debounced);
  if (debounced !== prevDebounced) {
    setPrevDebounced(debounced);
    if (parseAddCardInput(debounced).term) {
      setLoading(true);
    } else {
      setResults([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    const { term } = parseAddCardInput(debounced);
    if (!term) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as CardSearchResult[];
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
          setActiveIndex(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debounced]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const selected = rootRef.current?.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, view, open]);

  const { term } = parseAddCardInput(query);

  // Build combined list: card hits, then deck-nav matches (up to 5), then nav/create actions
  type SimpleItem =
    | { kind: "card"; card: CardSearchResult }
    | { kind: "deck-nav"; deck: MyDeck }
    | { kind: "view-decks" }
    | { kind: "create-deck" }
    | { kind: "view-shortcuts" };
  const listItems = useMemo<SimpleItem[]>(() => {
    const items: SimpleItem[] = [];

    if (term) {
      for (const card of results) {
        items.push({ kind: "card", card });
      }

      const lowerTerm = term.toLowerCase();
      const deckMatches = myDecks
        .filter((d) => d.name.toLowerCase().includes(lowerTerm))
        .slice(0, 5);
      for (const deck of deckMatches) {
        items.push({ kind: "deck-nav", deck });
      }

      items.push({ kind: "view-decks" });
      items.push({ kind: "create-deck" });
    }

    items.push({ kind: "view-shortcuts" });

    return items;
  }, [term, results, myDecks]);

  const { relevant: shortcutsRelevant, other: shortcutsOther } = useMemo(
    () =>
      view === "shortcuts"
        ? partitionShortcuts(query, { inDeckEditor: deckRoute != null })
        : { relevant: [] as ShortcutEntry[], other: [] as ShortcutEntry[] },
    [view, query, deckRoute],
  );
  const effectiveShowOther = showOther || query.trim().length > 0;
  const shortcutListLen = visibleShortcutCount(
    shortcutsRelevant.length,
    shortcutsOther.length,
    effectiveShowOther,
  );

  function onPick(item: SimpleItem) {
    if (item.kind === "view-shortcuts") {
      setView("shortcuts");
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    setQuery("");
    if (item.kind === "card") {
      const slug = toNameSlug(item.card.name);
      const href =
        pathname && pathname !== `/card/${slug}`
          ? `/card/${slug}?from=${encodeURIComponent(pathname)}`
          : `/card/${slug}`;
      router.push(href);
      return;
    }
    if (item.kind === "deck-nav") {
      router.push(`/deck/${item.deck.id}`);
      return;
    }
    if (item.kind === "view-decks") {
      router.push("/decks");
      return;
    }
    if (item.kind === "create-deck") {
      router.push("/deck/new");
    }
  }

  function pickShortcutEntry(entry: ShortcutEntry) {
    triggerShortcut(entry, router);
    setOpen(false);
    setQuery("");
    setView("list");
    setActiveIndex(0);
  }

  function pickShortcutNav(item: ShortcutNavItem) {
    if (item.kind === "toggle") {
      setShowOther((v) => !v);
      return;
    }
    pickShortcutEntry(item.entry);
  }

  function returnToList() {
    setView("list");
    setQuery("");
    setActiveIndex(0);
  }

  function handleShortcutsKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const len = shortcutListLen;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (len) setActiveIndex((i) => (i + 1) % len);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (len) setActiveIndex((i) => (i - 1 + len) % len);
    } else if (e.key === "Enter") {
      const navItem = shortcutNavAt(
        shortcutsRelevant,
        shortcutsOther,
        effectiveShowOther,
        activeIndex,
      );
      if (navItem) {
        e.preventDefault();
        pickShortcutNav(navItem);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      returnToList();
    } else if (e.key === "Backspace" && inputRef.current?.value === "") {
      e.preventDefault();
      returnToList();
    }
  }

  function handleListKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const len = listItems.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (len) setActiveIndex((i) => (i + 1) % len);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (len) setActiveIndex((i) => (i - 1 + len) % len);
    } else if (e.key === "Enter") {
      const item = listItems[activeIndex];
      if (item) {
        e.preventDefault();
        onPick(item);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else {
        inputRef.current?.blur();
      }
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (view === "shortcuts") handleShortcutsKey(e);
    else handleListKey(e);
  }

  const showPanel = open;

  // Group rendering helpers (list view only)
  const cardItems = listItems.filter((it): it is { kind: "card"; card: CardSearchResult } => it.kind === "card");
  const deckNavItems = listItems.filter((it): it is { kind: "deck-nav"; deck: MyDeck } => it.kind === "deck-nav");
  const actionItems = listItems.filter(
    (it): it is { kind: "view-decks" } | { kind: "create-deck" } | { kind: "view-shortcuts" } =>
      it.kind === "view-decks" || it.kind === "create-deck" || it.kind === "view-shortcuts",
  );

  const placeholder =
    view === "shortcuts" ? "Filter shortcuts…" : "Search cards…";

  return (
    <div ref={rootRef} className="relative w-full md:w-[360px] lg:w-[440px]">
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-md border border-input bg-muted/40 text-sm focus-within:bg-background focus-within:ring-1 focus-within:ring-ring transition-colors">
        {view === "shortcuts" ? (
          <button
            type="button"
            aria-label="Back to search"
            onClick={returnToList}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : (
          <SearchIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
        <input
          ref={inputRef}
          type="search"
          aria-label={view === "shortcuts" ? "Filter shortcuts" : "Search cards"}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {query || view === "shortcuts" ? (
          <button
            type="button"
            aria-label={view === "shortcuts" ? "Exit shortcuts" : "Clear search"}
            onClick={() => {
              if (view === "shortcuts") {
                returnToList();
              } else {
                setQuery("");
                setResults([]);
              }
              inputRef.current?.focus();
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        ) : (
          <Kbd className="hidden md:inline-flex shrink-0">⌘K</Kbd>
        )}
      </div>

      {showPanel && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-full mt-2 z-50 rounded-xl border bg-popover shadow-lg overflow-hidden"
        >
          {view === "shortcuts" ? (
            <ShortcutsView
              relevant={shortcutsRelevant}
              other={shortcutsOther}
              expanded={effectiveShowOther}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onPickEntry={pickShortcutEntry}
              onToggleOther={() => setShowOther((v) => !v)}
            />
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto p-1">
                {loading && cardItems.length === 0 && deckNavItems.length === 0 && (
                  <div className="py-4 px-3 text-sm text-muted-foreground">
                    Searching…
                  </div>
                )}
                {cardItems.length > 0 && (
                  <div className="py-1">
                    <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Cards
                    </div>
                    {cardItems.map((it) => {
                      const globalIdx = listItems.indexOf(it);
                      return (
                        <button
                          key={it.card.id}
                          type="button"
                          role="option"
                          aria-selected={globalIdx === activeIndex}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          onClick={() => onPick(it)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm min-h-11",
                            globalIdx === activeIndex && "bg-muted",
                          )}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{it.card.name}</span>
                            {it.card.typeLine && (
                              <span className="text-xs text-muted-foreground truncate">
                                {it.card.typeLine}
                              </span>
                            )}
                          </div>
                          {it.card.manaCost && (
                            <ManaCost cost={it.card.manaCost} className="shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {deckNavItems.length > 0 && (
                  <div className="py-1">
                    <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Your decks
                    </div>
                    {deckNavItems.map((it) => {
                      const globalIdx = listItems.indexOf(it);
                      return (
                        <button
                          key={it.deck.id}
                          type="button"
                          role="option"
                          aria-selected={globalIdx === activeIndex}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          onClick={() => onPick(it)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm min-h-10",
                            globalIdx === activeIndex && "bg-muted",
                          )}
                        >
                          <span className="font-medium truncate">{it.deck.name}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
                            {it.deck.format.charAt(0) + it.deck.format.slice(1).toLowerCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {actionItems.length > 0 && (
                  <div className="py-1">
                    <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Actions
                    </div>
                    {actionItems.map((it) => {
                      const globalIdx = listItems.indexOf(it);
                      return (
                        <button
                          key={it.kind}
                          type="button"
                          role="option"
                          aria-selected={globalIdx === activeIndex}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          onClick={() => onPick(it)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm min-h-10",
                            globalIdx === activeIndex && "bg-muted",
                          )}
                        >
                          {it.kind === "view-decks" ? (
                            <span className="text-sm inline-flex items-center gap-1.5">
                              <ChevronRight className="size-3.5" aria-hidden />
                              View your decks
                            </span>
                          ) : it.kind === "create-deck" ? (
                            <span className="text-sm">+ Create new deck</span>
                          ) : (
                            <span className="text-sm inline-flex items-center gap-1.5">
                              <Keyboard className="size-3.5" aria-hidden />
                              View all shortcuts
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t flex items-center gap-2">
                <Kbd>↵</Kbd>
                <span>selects</span>
                <span className="mx-1">·</span>
                <Kbd>Esc</Kbd>
                <span>closes</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
