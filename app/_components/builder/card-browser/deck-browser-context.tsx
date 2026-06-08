"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  addCardToDeck,
  addCardsToDeck,
  removeCardFromDeck,
  updateCardQuantity,
} from "@/lib/deck/editor-actions";
import { evaluateAddIntent } from "@/lib/deck/add-intent";
import { Zone, type Format } from "@/lib/generated/prisma/enums";
import type { CardSearchResult } from "@/lib/search/card-search";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";

interface CardLegality {
  legal: boolean;
  reasons: string[];
  currentCopies: number;
}

interface DeckBrowserValue {
  /** Total copies of a card across every zone of the deck. */
  countOf: (cardId: number) => number;
  add: (card: CardSearchResult, qty: number) => void;
  remove: (card: CardSearchResult) => void;
  legalityOf: (card: CardSearchResult) => CardLegality;
  /** Mainboard category adds land in, or null for uncategorized. */
  target: string | null;
  setTarget: (target: string | null) => void;
  categories: string[];
  format: Format;
  commanderIdentity: string[];
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  selected: Set<number>;
  toggleSelect: (card: CardSearchResult) => void;
  clearSelect: () => void;
  addSelected: (target: string | null) => void;
  pending: boolean;
}

const DeckBrowserContext = createContext<DeckBrowserValue | null>(null);

export function useDeckBrowser(): DeckBrowserValue {
  const ctx = useContext(DeckBrowserContext);
  if (!ctx) {
    throw new Error("useDeckBrowser must be used within a DeckBrowserProvider");
  }
  return ctx;
}

interface DeckBrowserProviderProps {
  deckId: string;
  cards: DeckCard[];
  dispatch: (action: ZoneAction) => void;
  categories: string[];
  format: Format;
  commanderIdentity: string[];
  children: ReactNode;
}

export function DeckBrowserProvider({
  deckId,
  cards,
  dispatch,
  categories,
  format,
  commanderIdentity,
  children,
}: DeckBrowserProviderProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [selectMode, setSelectModeState] = useState(false);
  const [selected, setSelected] = useState<Map<number, CardSearchResult>>(
    () => new Map(),
  );
  const [pending, startTransition] = useTransition();

  const countOf = useCallback(
    (cardId: number) => {
      let total = 0;
      for (const dc of cards) {
        if (dc.card.id === cardId) total += dc.quantity;
      }
      return total;
    },
    [cards],
  );

  const legalityOf = useCallback(
    (card: CardSearchResult): CardLegality => {
      const { legal, reasons, currentCopies } = evaluateAddIntent({
        card,
        format,
        deckCards: cards,
        quantity: 1,
        commanderIdentity,
      });
      return { legal, reasons, currentCopies };
    },
    [cards, format, commanderIdentity],
  );

  // Adds land in MAINBOARD under the active target category. No optimistic
  // ZoneAction exists for inserts, so the live decklist updates once the server
  // action revalidates the deck tag — the same path the header search uses.
  const add = useCallback(
    (card: CardSearchResult, qty: number) => {
      startTransition(async () => {
        await addCardToDeck(deckId, card.id, {
          quantity: qty,
          zone: Zone.MAINBOARD,
          category: target,
        });
      });
    },
    [deckId, target],
  );

  // Decrement one copy from the first matching deck card (preferring mainboard).
  const remove = useCallback(
    (card: CardSearchResult) => {
      const matches = cards.filter((dc) => dc.card.id === card.id);
      const dc =
        matches.find((m) => m.zone === Zone.MAINBOARD) ?? matches[0];
      if (!dc) return;
      startTransition(async () => {
        if (dc.quantity > 1) {
          dispatch({
            type: "update",
            deckCardId: dc.id,
            quantity: dc.quantity - 1,
          });
          await updateCardQuantity(deckId, dc.id, dc.quantity - 1);
        } else {
          dispatch({ type: "remove", deckCardId: dc.id });
          await removeCardFromDeck(deckId, dc.id);
        }
      });
    },
    [cards, deckId, dispatch],
  );

  const setSelectMode = useCallback((on: boolean) => {
    setSelectModeState(on);
    if (!on) setSelected(new Map());
  }, []);

  const toggleSelect = useCallback((card: CardSearchResult) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(card.id)) next.delete(card.id);
      else next.set(card.id, card);
      return next;
    });
  }, []);

  const clearSelect = useCallback(() => setSelected(new Map()), []);

  const addSelected = useCallback(
    (dest: string | null) => {
      const picked = [...selected.values()];
      if (picked.length === 0) return;
      startTransition(async () => {
        await addCardsToDeck(
          deckId,
          picked.map((c) => ({ cardId: c.id })),
          { zone: Zone.MAINBOARD, category: dest },
        );
        setSelected(new Map());
        setSelectModeState(false);
      });
    },
    [selected, deckId],
  );

  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);

  const value = useMemo<DeckBrowserValue>(
    () => ({
      countOf,
      add,
      remove,
      legalityOf,
      target,
      setTarget,
      categories,
      format,
      commanderIdentity,
      selectMode,
      setSelectMode,
      selected: selectedIds,
      toggleSelect,
      clearSelect,
      addSelected,
      pending,
    }),
    [
      countOf,
      add,
      remove,
      legalityOf,
      target,
      categories,
      format,
      commanderIdentity,
      selectMode,
      setSelectMode,
      selectedIds,
      toggleSelect,
      clearSelect,
      addSelected,
      pending,
    ],
  );

  return (
    <DeckBrowserContext.Provider value={value}>
      {children}
    </DeckBrowserContext.Provider>
  );
}
