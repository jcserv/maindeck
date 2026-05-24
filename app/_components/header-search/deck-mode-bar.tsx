"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Keyboard,
  Search as SearchIcon,
  X as XIcon,
} from "lucide-react";
import {
  useHeaderSearch,
  type DeckRouteSignal,
} from "@/app/_components/header-search/header-search-context";
import { useDeckSearch } from "@/app/_components/builder/deck-search-context";
import {
  partitionShortcuts,
  type ShortcutEntry,
} from "@/app/_components/hotkeys/registry";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { Kbd } from "@/components/ui/kbd";
import { addCardToDeck } from "@/lib/deck/editor-actions";
import { createCategory } from "@/app/_actions/deck/categories";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import type { CardSearchResult } from "@/lib/search/card-search";
import type { DeckCard } from "@/lib/deck/zone-view";
import {
  buildAddDestinations,
  evaluateAddIntent,
  parseAddCardInput,
  type AddDestination,
} from "@/lib/deck/add-intent";
import { cn, toTitleCase } from "@/lib/utils";
import { useCardSearch } from "./use-card-search";
import {
  FooterHint,
  ItemButton,
  ShortcutsView,
  shortcutNavAt,
  triggerShortcut,
  visibleShortcutCount,
  type ShortcutNavItem,
} from "./shared";

const ZONE_LABEL: Record<Zone, string> = {
  COMMANDER: "Commander",
  MAINBOARD: "Mainboard",
  SIDEBOARD: "Sideboard",
  CONSIDERING: "Considering",
};

type Staged = { card: CardSearchResult; quantity: number };

type ListItem =
  | { kind: "deck-match"; dc: DeckCard }
  | { kind: "global"; card: CardSearchResult }
  | { kind: "create-category"; name: string }
  | { kind: "show-more-deck"; remaining: number }
  | { kind: "show-more-add" }
  | { kind: "view-decks" }
  | { kind: "view-shortcuts" };

type DestItem = AddDestination;

type MoreItem =
  | { kind: "global"; card: CardSearchResult }
  | { kind: "load-more"; loading: boolean }
  | { kind: "deck-match"; dc: DeckCard };

const DECK_MATCH_LIMIT = 3;
const ADD_CARD_LIMIT = 3;
const PAGE_SIZE = 10;

export function DeckModeBar({ deckRoute }: { deckRoute: DeckRouteSignal }) {
  const router = useRouter();
  const {
    targetZone,
    targetCategory,
    pendingQuickAdd,
    clearPendingQuickAdd,
    registerInput,
    shortcutsTick,
  } = useHeaderSearch();
  const search = useDeckSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const { deckId, isOwner } = deckRoute;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<
    "list" | "destination" | "shortcuts" | "more-add" | "more-deck"
  >("list");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [destName, setDestName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [extraAddPages, setExtraAddPages] = useState<CardSearchResult[]>([]);
  const [addOffset, setAddOffset] = useState(0);
  const [addHasMore, setAddHasMore] = useState(false);
  const [addLoadingMore, setAddLoadingMore] = useState(false);
  const [deckShown, setDeckShown] = useState(PAGE_SIZE);
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
      setStaged(null);
      setDestName("");
      setActiveIndex(0);
    }
  }

  const setDeckQuery = search?.setQuery;
  const requestScrollTo = search?.requestScrollTo;
  const ranked = useMemo(() => search?.ranked ?? [], [search?.ranked]);
  const categories = useMemo(
    () => search?.meta.categories ?? [],
    [search?.meta.categories],
  );
  const format = search?.meta.format;
  const commanderFull = useMemo(() => {
    if (format !== Format.COMMANDER) return false;
    return (search?.meta.cards ?? []).some((c) => c.zone === Zone.COMMANDER);
  }, [search?.meta.cards, format]);

  const { term, quantity } = parseAddCardInput(query);

  // Card search (debounce, min-length gate, 429 back-off/retry) is shared with
  // the homepage bar via this hook. Add-card pagination below is deck-specific
  // and keys off `searchedTerm` / `globalResults`.
  const {
    term: searchedTerm,
    results: globalResults,
    loading,
    error: searchError,
  } = useCardSearch(query, { enabled: isOwner });

  useEffect(() => {
    return registerInput(inputRef.current) ?? undefined;
  }, [registerInput]);

  // Push the raw query to the deck-search context so deck rows can highlight.
  // Use `term` (strips leading `4x`) so highlighting ignores the prefix.
  useEffect(() => {
    setDeckQuery?.(term);
  }, [setDeckQuery, term]);

  // Reset add-card pagination whenever a fresh page-one result set lands (new
  // term, owner toggle, or a cleared search all flow through `globalResults`).
  const [prevGlobal, setPrevGlobal] = useState(globalResults);
  if (globalResults !== prevGlobal) {
    setPrevGlobal(globalResults);
    setExtraAddPages([]);
    setAddOffset(globalResults.length);
    setAddHasMore(globalResults.length === PAGE_SIZE);
    setAddLoadingMore(false);
  }

  // Collapse the "show all deck matches" view back to the first page on a new
  // search term.
  const [prevSearched, setPrevSearched] = useState(searchedTerm);
  if (searchedTerm !== prevSearched) {
    setPrevSearched(searchedTerm);
    setDeckShown(PAGE_SIZE);
  }

  const loadMoreAdd = useCallback(async () => {
    if (!isOwner || !addHasMore || addLoadingMore) return;
    const t = searchedTerm;
    if (!t) return;
    setAddLoadingMore(true);
    try {
      const res = await fetch(
        `/api/cards/search?q=${encodeURIComponent(t)}&offset=${addOffset}`,
      );
      const data = (await res.json()) as CardSearchResult[];
      const items = Array.isArray(data) ? data : [];
      setExtraAddPages((prev) => [...prev, ...items]);
      setAddOffset((prev) => prev + items.length);
      setAddHasMore(items.length === PAGE_SIZE);
    } catch {
      setAddHasMore(false);
    } finally {
      setAddLoadingMore(false);
    }
  }, [isOwner, addHasMore, addLoadingMore, addOffset, searchedTerm]);

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

  const deckCards = useMemo(() => search?.meta.cards ?? [], [search?.meta.cards]);

  const commanderIdentity = useMemo(() => {
    const set = new Set<string>();
    for (const c of deckCards) {
      if (c.zone === Zone.COMMANDER) {
        for (const x of c.card.colorIdentity ?? []) set.add(x);
      }
    }
    return [...set];
  }, [deckCards]);

  const sortedGlobal = useMemo(() => {
    if (!isOwner || !format) return globalResults;
    return [...globalResults].sort((a, b) => {
      const legalA = evaluateAddIntent({
        card: a,
        format,
        deckCards,
        quantity,
        commanderIdentity,
      }).legal;
      const legalB = evaluateAddIntent({
        card: b,
        format,
        deckCards,
        quantity,
        commanderIdentity,
      }).legal;
      if (legalA === legalB) return 0;
      return legalA ? -1 : 1;
    });
  }, [globalResults, isOwner, format, deckCards, quantity, commanderIdentity]);

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    if (term) {
      if (isOwner) {
        for (const card of sortedGlobal.slice(0, ADD_CARD_LIMIT)) {
          items.push({ kind: "global", card });
        }
        if (sortedGlobal.length > ADD_CARD_LIMIT || addHasMore) {
          items.push({ kind: "show-more-add" });
        }
        const typed = term.trim();
        const categoryExists = categories.some(
          (c) => c.toLowerCase() === typed.toLowerCase(),
        );
        if (typed.length > 0 && !categoryExists) {
          items.push({ kind: "create-category", name: typed });
        }
      }
      for (const dc of ranked.slice(0, DECK_MATCH_LIMIT)) {
        items.push({ kind: "deck-match", dc });
      }
      if (ranked.length > DECK_MATCH_LIMIT) {
        items.push({
          kind: "show-more-deck",
          remaining: ranked.length - DECK_MATCH_LIMIT,
        });
      }
    }
    items.push({ kind: "view-decks" });
    items.push({ kind: "view-shortcuts" });
    return items;
  }, [term, ranked, sortedGlobal, categories, isOwner, addHasMore]);

  const moreAddItems = useMemo<MoreItem[]>(() => {
    if (view !== "more-add") return [];
    const items: MoreItem[] = [];
    for (const card of sortedGlobal) {
      items.push({ kind: "global", card });
    }
    for (const card of extraAddPages) {
      items.push({ kind: "global", card });
    }
    if (addHasMore || addLoadingMore) {
      items.push({ kind: "load-more", loading: addLoadingMore });
    }
    return items;
  }, [view, sortedGlobal, extraAddPages, addHasMore, addLoadingMore]);

  const moreDeckItems = useMemo<MoreItem[]>(() => {
    if (view !== "more-deck") return [];
    const items: MoreItem[] = [];
    for (const dc of ranked.slice(0, deckShown)) {
      items.push({ kind: "deck-match", dc });
    }
    if (ranked.length > deckShown) {
      items.push({ kind: "load-more", loading: false });
    }
    return items;
  }, [view, ranked, deckShown]);

  const { relevant: shortcutsRelevant, other: shortcutsOther } = useMemo(
    () =>
      view === "shortcuts"
        ? partitionShortcuts(query, { inDeckEditor: true })
        : { relevant: [] as ShortcutEntry[], other: [] as ShortcutEntry[] },
    [view, query],
  );
  const effectiveShowOther = showOther || query.trim().length > 0;
  const shortcutListLen = visibleShortcutCount(
    shortcutsRelevant.length,
    shortcutsOther.length,
    effectiveShowOther,
  );

  const destItems = useMemo<DestItem[]>(() => {
    if (!staged) return [];
    return buildAddDestinations({ format, categories, commanderFull });
  }, [staged, categories, format, commanderFull]);

  // Pre-select the current header-search target when entering View B.
  const [prevView, setPrevView] = useState(view);
  if (view !== prevView) {
    setPrevView(view);
    if (view === "destination" && staged) {
      const idx = destItems.findIndex((it) => {
        if (targetZone === Zone.MAINBOARD && it.kind === "dest-mainboard") {
          return it.category === targetCategory;
        }
        if (it.kind === "dest-zone") return it.zone === targetZone;
        return false;
      });
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }

  // Clamp active index when list size changes.
  const currentLen =
    view === "list"
      ? listItems.length
      : view === "destination"
        ? destItems.length
        : view === "shortcuts"
          ? shortcutListLen
          : view === "more-add"
            ? moreAddItems.length
            : moreDeckItems.length;
  const [prevLen, setPrevLen] = useState(currentLen);
  if (currentLen !== prevLen) {
    setPrevLen(currentLen);
    if (currentLen === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= currentLen) {
      setActiveIndex(currentLen - 1);
    }
  }

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setView("list");
    setStaged(null);
    setDestName("");
    setExtraAddPages([]);
    setAddOffset(0);
    setAddHasMore(false);
    setAddLoadingMore(false);
    setDeckShown(PAGE_SIZE);
    clearPendingQuickAdd();
  }

  const handleQuickAdd = useCallback(
    (card: CardSearchResult, qty: number) => {
      if (!isOwner) return;
      const zone = targetZone;
      const category = zone === Zone.MAINBOARD ? targetCategory : null;
      startTransition(async () => {
        await addCardToDeck(deckId, card.id, { quantity: qty, zone, category });
        closeAndReset();
        inputRef.current?.focus();
      });
    },
    [isOwner, targetZone, targetCategory, deckId],
  );

  const confirmAdd = useCallback(
    (zone: Zone, category: string | null) => {
      if (!staged) return;
      const qty = staged.quantity;
      const cardId = staged.card.id;
      startTransition(async () => {
        await addCardToDeck(deckId, cardId, { quantity: qty, zone, category });
        closeAndReset();
        inputRef.current?.focus();
      });
    },
    [staged, deckId],
  );

  function handleDeckMatch(dc: DeckCard) {
    requestScrollTo?.(dc.id);
    closeAndReset();
  }

  function handleCreateCategoryAction(name: string) {
    startTransition(async () => {
      try {
        await createCategory(deckId, name);
        // Surface as the new active target via the header-search context so the
        // next add lands there. Tags are emitted server-side via createCategory
        // (runOwnerDeckMutation "category" → deckTag(deckId)), so no refresh needed.
        closeAndReset();
      } catch {
        // no-op: duplicate names surface as the category-already-exists state.
      }
    });
  }

  async function handleCreateDestCategory() {
    const name = destName.trim();
    if (!name) return;
    try {
      await createCategory(deckId, name);
    } catch {
      return;
    }
    confirmAdd(Zone.MAINBOARD, name);
  }

  function pickListItem(item: ListItem, opts?: { shiftQuickAdd?: boolean }) {
    if (item.kind === "deck-match") {
      handleDeckMatch(item.dc);
      return;
    }
    if (item.kind === "global") {
      if (opts?.shiftQuickAdd || pendingQuickAdd) {
        handleQuickAdd(item.card, quantity);
        return;
      }
      setStaged({ card: item.card, quantity });
      setView("destination");
      return;
    }
    if (item.kind === "create-category") {
      handleCreateCategoryAction(item.name);
      return;
    }
    if (item.kind === "show-more-add") {
      setView("more-add");
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }
    if (item.kind === "show-more-deck") {
      setView("more-deck");
      setDeckShown(PAGE_SIZE);
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }
    if (item.kind === "view-decks") {
      closeAndReset();
      router.push("/decks");
      return;
    }
    if (item.kind === "view-shortcuts") {
      setView("shortcuts");
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }

  function pickMoreItem(item: MoreItem, opts?: { shiftQuickAdd?: boolean }) {
    if (item.kind === "global") {
      if (opts?.shiftQuickAdd || pendingQuickAdd) {
        handleQuickAdd(item.card, quantity);
        return;
      }
      setStaged({ card: item.card, quantity });
      setView("destination");
      return;
    }
    if (item.kind === "deck-match") {
      handleDeckMatch(item.dc);
      return;
    }
    if (item.kind === "load-more") {
      if (view === "more-add") {
        void loadMoreAdd();
      } else if (view === "more-deck") {
        setDeckShown((n) => n + PAGE_SIZE);
      }
    }
  }

  function returnFromMore() {
    setView("list");
    setActiveIndex(0);
  }

  function pickShortcutEntry(entry: ShortcutEntry) {
    triggerShortcut(entry, router);
    closeAndReset();
  }

  function pickShortcutNav(item: ShortcutNavItem) {
    if (item.kind === "toggle") {
      setShowOther((v) => !v);
      return;
    }
    pickShortcutEntry(item.entry);
  }

  function returnFromShortcuts() {
    setView("list");
    setQuery("");
    setActiveIndex(0);
  }

  function pickDestItem(item: DestItem) {
    if (item.kind === "dest-mainboard") {
      confirmAdd(Zone.MAINBOARD, item.category);
      return;
    }
    if (item.kind === "dest-zone") {
      if (item.disabled) return;
      confirmAdd(item.zone, null);
      return;
    }
    if (item.kind === "dest-create-category") {
      void handleCreateDestCategory();
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (view === "list") {
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
          pickListItem(item, { shiftQuickAdd: e.shiftKey });
        }
      } else if (e.key === "Tab") {
        const item = listItems[activeIndex];
        if (item?.kind === "global") {
          e.preventDefault();
          if (pendingQuickAdd) {
            handleQuickAdd(item.card, quantity);
          } else {
            setStaged({ card: item.card, quantity });
            setView("destination");
          }
        }
      } else if (e.key === "Escape") {
        if (open) {
          e.preventDefault();
          setOpen(false);
        } else {
          inputRef.current?.blur();
        }
      }
      return;
    }

    if (view === "more-add" || view === "more-deck") {
      const items = view === "more-add" ? moreAddItems : moreDeckItems;
      const len = items.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (len) setActiveIndex((i) => (i + 1) % len);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (len) setActiveIndex((i) => (i - 1 + len) % len);
      } else if (e.key === "Enter") {
        const item = items[activeIndex];
        if (item) {
          e.preventDefault();
          pickMoreItem(item, { shiftQuickAdd: e.shiftKey });
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        returnFromMore();
      } else if (e.key === "Backspace" && inputRef.current?.value === "") {
        e.preventDefault();
        returnFromMore();
      }
      return;
    }

    if (view === "shortcuts") {
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
        returnFromShortcuts();
      } else if (
        e.key === "Backspace" &&
        inputRef.current?.value === ""
      ) {
        e.preventDefault();
        returnFromShortcuts();
      }
      return;
    }

    // view === "destination"
    const len = destItems.length;
    const activeDest = destItems[activeIndex];
    const typingCategory = activeDest?.kind === "dest-create-category";

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (len) setActiveIndex((i) => (i + 1) % len);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (len) setActiveIndex((i) => (i - 1 + len) % len);
    } else if (e.key === "Enter") {
      if (activeDest) {
        e.preventDefault();
        pickDestItem(activeDest);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setView("list");
      setStaged(null);
      setDestName("");
    } else if (
      e.key === "Backspace" &&
      !typingCategory &&
      inputRef.current?.value === ""
    ) {
      e.preventDefault();
      setView("list");
      setStaged(null);
      setDestName("");
    }
  }

  const showPanel = open;
  const destTyping =
    destItems[activeIndex]?.kind === "dest-create-category";

  const placeholder =
    view === "shortcuts"
      ? "Filter shortcuts…"
      : view === "more-add"
        ? "All add results"
        : view === "more-deck"
          ? "All deck matches"
          : isOwner
            ? view === "destination"
              ? destTyping
                ? "New category name…"
                : "Choose destination…"
              : "Find or add… (e.g. cmc<=2 t:creature)"
            : "Find in deck… (e.g. cmc<=2 t:creature)";

  const inputValue =
    view === "shortcuts"
      ? query
      : view === "destination"
        ? destTyping
          ? destName
          : ""
        : query;

  return (
    <div ref={rootRef} className="relative w-full md:w-[360px] lg:w-[440px]">
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-md border border-input bg-muted/40 text-sm focus-within:bg-background focus-within:ring-1 focus-within:ring-ring transition-colors">
        {view === "shortcuts" ? (
          <button
            type="button"
            aria-label="Back to search"
            onClick={returnFromShortcuts}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : view === "more-add" || view === "more-deck" ? (
          <button
            type="button"
            aria-label="Back to results"
            onClick={returnFromMore}
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
          value={inputValue}
          placeholder={placeholder}
          disabled={isPending}
          onChange={(e) => {
            if (view === "destination") {
              if (destTyping) setDestName(e.target.value);
              return;
            }
            if (view === "shortcuts") {
              setQuery(e.target.value);
              setActiveIndex(0);
              return;
            }
            if (view === "more-add" || view === "more-deck") {
              setView("list");
              setActiveIndex(0);
            }
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {query || view === "destination" || view === "shortcuts" ? (
          <button
            type="button"
            aria-label={view === "shortcuts" ? "Exit shortcuts" : "Clear search"}
            onClick={() => {
              if (view === "shortcuts") {
                returnFromShortcuts();
              } else {
                closeAndReset();
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
          {view === "list" ? (
            <ListView
              items={listItems}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onPick={(item) => pickListItem(item)}
              loading={loading}
              isOwner={isOwner}
              searchError={searchError}
              {...(format !== undefined && { format })}
              {...(deckCards !== undefined && { deckCards })}
              {...(quantity !== undefined && { quantity })}
              {...(commanderIdentity !== undefined && { commanderIdentity })}
            />
          ) : view === "shortcuts" ? (
            <ShortcutsView
              relevant={shortcutsRelevant}
              other={shortcutsOther}
              expanded={effectiveShowOther}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onPickEntry={pickShortcutEntry}
              onToggleOther={() => setShowOther((v) => !v)}
            />
          ) : view === "more-add" ? (
            <MoreView
              title="Add new card"
              items={moreAddItems}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onPick={(item) => pickMoreItem(item)}
              {...(format !== undefined && { format })}
              {...(deckCards !== undefined && { deckCards })}
              {...(quantity !== undefined && { quantity })}
              {...(commanderIdentity !== undefined && { commanderIdentity })}
            />
          ) : view === "more-deck" ? (
            <MoreView
              title="In this deck"
              items={moreDeckItems}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onPick={(item) => pickMoreItem(item)}
            />
          ) : (
            staged && (
              <DestinationView
                staged={staged}
                items={destItems}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                onPick={pickDestItem}
                destName={destName}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── deck-mode subviews ───────────────────────── */

interface ListViewProps {
  items: ListItem[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onPick: (item: ListItem) => void;
  loading: boolean;
  isOwner: boolean;
  searchError: string | null;
  format?: Format;
  deckCards?: DeckCard[];
  quantity?: number;
  commanderIdentity?: string[];
}

function ListView({
  items,
  activeIndex,
  setActiveIndex,
  onPick,
  loading,
  isOwner,
  searchError,
  format,
  deckCards = [],
  quantity = 1,
  commanderIdentity,
}: ListViewProps) {
  type DeckEntry = {
    item: Extract<ListItem, { kind: "deck-match" }>;
    index: number;
  };
  type GlobalEntry = {
    item: Extract<ListItem, { kind: "global" }>;
    index: number;
  };
  type ActionEntry = {
    item: Extract<
      ListItem,
      { kind: "create-category" } | { kind: "view-decks" } | { kind: "view-shortcuts" }
    >;
    index: number;
  };
  type ShowMoreAdd = {
    item: Extract<ListItem, { kind: "show-more-add" }>;
    index: number;
  };
  type ShowMoreDeck = {
    item: Extract<ListItem, { kind: "show-more-deck" }>;
    index: number;
  };
  const deckEntries: DeckEntry[] = [];
  const globalEntries: GlobalEntry[] = [];
  const actionEntries: ActionEntry[] = [];
  const showMoreAddArr: ShowMoreAdd[] = [];
  const showMoreDeckArr: ShowMoreDeck[] = [];
  items.forEach((it, index) => {
    if (it.kind === "deck-match") deckEntries.push({ item: it, index });
    else if (it.kind === "global") globalEntries.push({ item: it, index });
    else if (it.kind === "show-more-add")
      showMoreAddArr.push({ item: it, index });
    else if (it.kind === "show-more-deck")
      showMoreDeckArr.push({ item: it, index });
    else if (
      it.kind === "create-category" ||
      it.kind === "view-decks" ||
      it.kind === "view-shortcuts"
    )
      actionEntries.push({ item: it, index });
  });
  const showMoreAdd: ShowMoreAdd | undefined = showMoreAddArr[0];
  const showMoreDeck: ShowMoreDeck | undefined = showMoreDeckArr[0];

  return (
    <>
      <div className="max-h-80 overflow-y-auto p-1">
        {searchError && (
          <div
            role="alert"
            className="mx-1 mb-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {searchError}
          </div>
        )}
        {items.length === 0 && !loading && !searchError && (
          <div className="py-4 px-3 text-sm text-muted-foreground">
            Start typing to find cards in this deck or add new ones.
          </div>
        )}
        {isOwner && (globalEntries.length > 0 || loading) && (
          <Group
            label="Add new card"
            {...(loading && globalEntries.length === 0 && { hint: "Searching…" })}
          >
            {globalEntries.map(({ item: it, index: i }) => {
              const legality = evaluateAddIntent({
                card: it.card,
                format,
                deckCards,
                quantity,
                ...(commanderIdentity !== undefined && { commanderIdentity }),
              });
              return (
                <ItemButton
                  key={`g-${it.card.id}`}
                  active={i === activeIndex}
                  onHover={() => setActiveIndex(i)}
                  onPick={() => onPick(it)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {!legality.legal && (
                      <span
                        aria-label={`Illegal: ${legality.reasons.join("; ")}`}
                        className="shrink-0 inline-flex"
                      >
                        <XIcon className="size-3.5 text-destructive" aria-hidden />
                      </span>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{it.card.name}</span>
                      {it.card.typeLine && (
                        <span className="text-xs text-muted-foreground truncate">
                          {it.card.typeLine}
                        </span>
                      )}
                      {!legality.legal && legality.reasons.length > 0 && (
                        <span className="text-xs italic text-muted-foreground/80 truncate">
                          {legality.reasons.join("; ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {it.card.manaCost && (
                    <ManaCost cost={it.card.manaCost} className="shrink-0" />
                  )}
                </ItemButton>
              );
            })}
            {showMoreAdd ? (
              <ShowMoreRow
                active={showMoreAdd.index === activeIndex}
                onHover={() => setActiveIndex(showMoreAdd!.index)}
                onPick={() => onPick(showMoreAdd!.item)}
                label="Show more"
              />
            ) : null}
          </Group>
        )}
        {deckEntries.length > 0 && (
          <Group label="In this deck">
            {deckEntries.map(({ item: it, index: i }) => (
              <ItemButton
                key={`d-${it.dc.id}`}
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onPick={() => onPick(it)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">
                    {it.dc.card.name}
                  </span>
                  {it.dc.card.typeLine && (
                    <span className="text-xs text-muted-foreground truncate">
                      {ZONE_LABEL[it.dc.zone]}
                      {it.dc.category ? ` · ${it.dc.category}` : ""} ·{" "}
                      {it.dc.card.typeLine}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  × {it.dc.quantity}
                </span>
              </ItemButton>
            ))}
            {showMoreDeck ? (
              <ShowMoreRow
                active={showMoreDeck.index === activeIndex}
                onHover={() => setActiveIndex(showMoreDeck!.index)}
                onPick={() => onPick(showMoreDeck!.item)}
                label={`Show all ${
                  showMoreDeck.item.remaining + DECK_MATCH_LIMIT
                } matches`}
              />
            ) : null}
          </Group>
        )}
        {actionEntries.length > 0 && (
          <Group label="Actions">
            {actionEntries.map(({ item: it, index: i }) => (
              <ItemButton
                key={it.kind === "create-category" ? `a-cc-${it.name}` : `a-${it.kind}`}
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onPick={() => onPick(it)}
              >
                {it.kind === "create-category" ? (
                  <span className="text-sm">
                    + Create category{" "}
                    <span className="font-medium">&ldquo;{it.name}&rdquo;</span>
                  </span>
                ) : it.kind === "view-decks" ? (
                  <span className="text-sm inline-flex items-center gap-1.5">
                    <ChevronRight className="size-3.5" aria-hidden />
                    View your decks
                  </span>
                ) : (
                  <span className="text-sm inline-flex items-center gap-1.5">
                    <Keyboard className="size-3.5" aria-hidden />
                    View all shortcuts
                  </span>
                )}
              </ItemButton>
            ))}
          </Group>
        )}
      </div>
      <FooterHint mode="list" />
    </>
  );
}

interface MoreViewProps {
  title: string;
  items: MoreItem[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onPick: (item: MoreItem) => void;
  format?: Format;
  deckCards?: DeckCard[];
  quantity?: number;
  commanderIdentity?: string[];
}

function MoreView({
  title,
  items,
  activeIndex,
  setActiveIndex,
  onPick,
  format,
  deckCards = [],
  quantity = 1,
  commanderIdentity,
}: MoreViewProps) {
  return (
    <>
      <div className="px-3 py-2 text-xs border-b bg-muted/40 flex items-center gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">
          ({items.filter((it) => it.kind !== "load-more").length})
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto p-1">
        {items.length === 0 ? (
          <div className="py-4 px-3 text-sm text-muted-foreground">
            No results.
          </div>
        ) : (
          items.map((it, i) => {
            if (it.kind === "global") {
              const legality = evaluateAddIntent({
                card: it.card,
                format,
                deckCards,
                quantity,
                ...(commanderIdentity !== undefined && { commanderIdentity }),
              });
              return (
                <ItemButton
                  key={`mg-${it.card.id}`}
                  active={i === activeIndex}
                  onHover={() => setActiveIndex(i)}
                  onPick={() => onPick(it)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {!legality.legal && (
                      <span
                        aria-label={`Illegal: ${legality.reasons.join("; ")}`}
                        className="shrink-0 inline-flex"
                      >
                        <XIcon
                          className="size-3.5 text-destructive"
                          aria-hidden
                        />
                      </span>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">
                        {it.card.name}
                      </span>
                      {it.card.typeLine && (
                        <span className="text-xs text-muted-foreground truncate">
                          {it.card.typeLine}
                        </span>
                      )}
                      {!legality.legal && legality.reasons.length > 0 && (
                        <span className="text-xs italic text-muted-foreground/80 truncate">
                          {legality.reasons.join("; ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {it.card.manaCost && (
                    <ManaCost cost={it.card.manaCost} className="shrink-0" />
                  )}
                </ItemButton>
              );
            }
            if (it.kind === "deck-match") {
              return (
                <ItemButton
                  key={`md-${it.dc.id}`}
                  active={i === activeIndex}
                  onHover={() => setActiveIndex(i)}
                  onPick={() => onPick(it)}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">
                      {it.dc.card.name}
                    </span>
                    {it.dc.card.typeLine && (
                      <span className="text-xs text-muted-foreground truncate">
                        {ZONE_LABEL[it.dc.zone]}
                        {it.dc.category ? ` · ${it.dc.category}` : ""} ·{" "}
                        {it.dc.card.typeLine}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    × {it.dc.quantity}
                  </span>
                </ItemButton>
              );
            }
            return (
              <ShowMoreRow
                key="load-more"
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onPick={() => onPick(it)}
                label={it.loading ? "Loading…" : "View more"}
              />
            );
          })
        )}
      </div>
      <FooterHint mode="more" />
    </>
  );
}

interface DestinationViewProps {
  staged: Staged;
  items: DestItem[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onPick: (item: DestItem) => void;
  destName: string;
}

function DestinationView({
  staged,
  items,
  activeIndex,
  setActiveIndex,
  onPick,
  destName,
}: DestinationViewProps) {
  return (
    <>
      <div className="px-3 py-2 text-xs border-b bg-muted/40 flex items-center gap-2">
        <span className="font-medium truncate">{staged.card.name}</span>
        <span className="text-muted-foreground tabular-nums shrink-0">
          × {staged.quantity}
        </span>
        {staged.card.manaCost && (
          <ManaCost cost={staged.card.manaCost} className="shrink-0 ml-auto" />
        )}
      </div>
      <div className="max-h-80 overflow-y-auto p-1">
        {items.map((it, i) => {
          if (it.kind === "dest-mainboard") {
            const label = it.category
              ? `Mainboard · ${toTitleCase(it.category)}`
              : "Mainboard (uncategorized)";
            return (
              <ItemButton
                key={`m-${it.category ?? ""}`}
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onPick={() => onPick(it)}
              >
                <span>{label}</span>
              </ItemButton>
            );
          }
          if (it.kind === "dest-zone") {
            return (
              <ItemButton
                key={`z-${it.zone}`}
                active={i === activeIndex}
                onHover={() => setActiveIndex(i)}
                onPick={() => onPick(it)}
                {...(it.disabled !== undefined && { disabled: it.disabled })}
              >
                <span>{ZONE_LABEL[it.zone]}</span>
                {it.hint && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {it.hint}
                  </span>
                )}
              </ItemButton>
            );
          }
          // dest-create-category
          return (
            <ItemButton
              key="create"
              active={i === activeIndex}
              onHover={() => setActiveIndex(i)}
              onPick={() => onPick(it)}
            >
              <span>
                {i === activeIndex && destName
                  ? `+ Create "${destName}"`
                  : "+ Create new category"}
              </span>
              {i === activeIndex && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Type to name
                </span>
              )}
            </ItemButton>
          );
        })}
      </div>
      <FooterHint mode="destination" />
    </>
  );
}

function ShowMoreRow({
  active,
  onHover,
  onPick,
  label,
}: {
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground min-h-8",
        active && "bg-muted text-foreground",
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <ChevronRight className="size-3" aria-hidden />
        {label}
      </span>
    </button>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <span>{label}</span>
        {hint && <span className="text-[11px] normal-case">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
