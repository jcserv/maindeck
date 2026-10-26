"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BulkSelectionTarget } from "@/lib/deck/bulk-actions";
import type { DeckCard } from "@/lib/deck/zone-view";

const SELECT_KEY_ATTR = "data-select-key";
const DECK_CARD_ID_ATTR = "data-select-deck-card-id";
const VIA_CATEGORY_ATTR = "data-select-via-category";

function rowSelectionKey(dc: DeckCard): string {
  return dc.isSecondary ? `${dc.id}::${dc.sectionCategory}` : dc.id;
}

function rowTarget(dc: DeckCard): BulkSelectionTarget {
  return dc.isSecondary && dc.sectionCategory
    ? { deckCardId: dc.id, viaCategory: dc.sectionCategory }
    : { deckCardId: dc.id };
}

function rowSelectionAttrs(dc: DeckCard) {
  return {
    [SELECT_KEY_ATTR]: rowSelectionKey(dc),
    [DECK_CARD_ID_ATTR]: dc.id,
    [VIA_CATEGORY_ATTR]: dc.isSecondary ? dc.sectionCategory : undefined,
  };
}

function targetFromElement(el: Element): BulkSelectionTarget | null {
  const deckCardId = el.getAttribute(DECK_CARD_ID_ATTR);
  if (!deckCardId) return null;
  const viaCategory = el.getAttribute(VIA_CATEGORY_ATTR);
  return viaCategory ? { deckCardId, viaCategory } : { deckCardId };
}

interface BulkSelectionValue {
  active: boolean;
  setActive: (active: boolean) => void;
  selected: ReadonlyMap<string, BulkSelectionTarget>;
  isSelected: (dc: DeckCard) => boolean;
  toggle: (dc: DeckCard, opts?: { range?: boolean }) => void;
  clear: () => void;
}

const BulkSelectionContext = createContext<BulkSelectionValue | null>(null);

export function useBulkSelection(): BulkSelectionValue | null {
  return useContext(BulkSelectionContext);
}

export function BulkSelectionProvider({
  cards,
  children,
}: {
  cards: DeckCard[];
  children: ReactNode;
}) {
  const [active, setActiveState] = useState(false);
  const [selected, setSelected] = useState<Map<string, BulkSelectionTarget>>(
    () => new Map(),
  );
  const anchorRef = useRef<string | null>(null);

  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
    if (!next) {
      setSelected(new Map());
      anchorRef.current = null;
    }
  }, []);

  const clear = useCallback(() => setActive(false), [setActive]);

  const toggle = useCallback(
    (dc: DeckCard, opts?: { range?: boolean }) => {
      const key = rowSelectionKey(dc);
      const anchor = anchorRef.current;
      setActiveState(true);
      setSelected((prev) => {
        const next = new Map(prev);
        if (opts?.range && anchor && anchor !== key) {
          const rows = [...document.querySelectorAll(`[${SELECT_KEY_ATTR}]`)];
          const keys = rows.map((el) => el.getAttribute(SELECT_KEY_ATTR));
          const from = keys.indexOf(anchor);
          const to = keys.indexOf(key);
          if (from !== -1 && to !== -1) {
            const [lo, hi] = from < to ? [from, to] : [to, from];
            for (const el of rows.slice(lo, hi + 1)) {
              const target = targetFromElement(el);
              if (target) next.set(el.getAttribute(SELECT_KEY_ATTR)!, target);
            }
            return next;
          }
        }
        if (next.has(key)) next.delete(key);
        else next.set(key, rowTarget(dc));
        return next;
      });
      anchorRef.current = key;
    },
    [],
  );

  const liveKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const dc of cards) {
      keys.add(dc.id);
      for (const name of dc.zone === "MAINBOARD" ? dc.categories.slice(1) : []) {
        keys.add(`${dc.id}::${name}`);
      }
    }
    return keys;
  }, [cards]);
  const liveSelected = useMemo(() => {
    const next = new Map<string, BulkSelectionTarget>();
    for (const [key, target] of selected) {
      if (liveKeys.has(key)) next.set(key, target);
    }
    return next;
  }, [selected, liveKeys]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) setActive(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, setActive]);

  const value = useMemo<BulkSelectionValue>(
    () => ({
      active,
      setActive,
      selected: liveSelected,
      isSelected: (dc) => liveSelected.has(rowSelectionKey(dc)),
      toggle,
      clear,
    }),
    [active, setActive, liveSelected, toggle, clear],
  );

  return (
    <BulkSelectionContext.Provider value={value}>
      {children}
    </BulkSelectionContext.Provider>
  );
}

function handleSelectionClick(
  selection: BulkSelectionValue | null,
  dc: DeckCard,
  e: React.MouseEvent,
): boolean {
  if (!selection) return false;
  const modifier = e.metaKey || e.ctrlKey;
  if (!selection.active && !modifier && !e.shiftKey) return false;
  e.preventDefault();
  selection.toggle(dc, { range: e.shiftKey });
  return true;
}

export function useRowSelection(dc: DeckCard) {
  const selection = useBulkSelection();
  const selecting = selection?.active ?? false;
  const selected = selection?.isSelected(dc) ?? false;
  return {
    selecting,
    selected,
    attrs: {
      ...rowSelectionAttrs(dc),
      "data-selected": selected ? "true" : undefined,
    },
    buttonAttrs: selecting
      ? { "aria-disabled": false, "aria-pressed": selected }
      : {},
    onClick: (e: React.MouseEvent) => handleSelectionClick(selection, dc, e),
    toggle: () => selection?.toggle(dc),
  };
}
