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
import { Zone } from "@/lib/generated/prisma/enums";

export interface DeckRouteSignal {
  deckId: string;
  isOwner: boolean;
}

interface FocusOpts {
  zone?: Zone;
  category?: string | null;
}

interface HeaderSearchContextValue {
  targetZone: Zone;
  targetCategory: string | null;
  focus: (opts?: FocusOpts) => void;
  registerInput: (el: HTMLInputElement | null) => (() => void) | void;
  deckRoute: DeckRouteSignal | null;
  registerDeckRoute: (signal: DeckRouteSignal | null) => void;
}

const HeaderSearchContext = createContext<HeaderSearchContextValue | null>(null);

export function useHeaderSearch(): HeaderSearchContextValue {
  const ctx = useContext(HeaderSearchContext);
  if (!ctx) {
    throw new Error(
      "useHeaderSearch must be used within HeaderSearchProvider",
    );
  }
  return ctx;
}

export function HeaderSearchProvider({ children }: { children: ReactNode }) {
  const [targetZone, setTargetZone] = useState<Zone>(Zone.MAINBOARD);
  const [targetCategory, setTargetCategory] = useState<string | null>(null);
  const [deckRoute, setDeckRoute] = useState<DeckRouteSignal | null>(null);
  const inputsRef = useRef<Set<HTMLInputElement>>(new Set());

  const registerInput = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    inputsRef.current.add(el);
    return () => {
      inputsRef.current.delete(el);
    };
  }, []);

  const registerDeckRoute = useCallback(
    (signal: DeckRouteSignal | null) => setDeckRoute(signal),
    [],
  );

  const focus = useCallback((opts?: FocusOpts) => {
    setTargetZone(opts?.zone ?? Zone.MAINBOARD);
    setTargetCategory(opts?.category ?? null);
    // The header mounts one desktop and one mobile HeaderSearchBar; pick
    // the visible one (offsetParent is null for display:none elements).
    let target: HTMLInputElement | null = null;
    let fallback: HTMLInputElement | null = null;
    for (const el of inputsRef.current) {
      fallback = el;
      if (el.offsetParent !== null) {
        target = el;
        break;
      }
    }
    target ??= fallback;
    if (target) {
      target.focus();
      target.select();
    }
  }, []);

  const value = useMemo<HeaderSearchContextValue>(
    () => ({
      targetZone,
      targetCategory,
      focus,
      registerInput,
      deckRoute,
      registerDeckRoute,
    }),
    [targetZone, targetCategory, focus, registerInput, deckRoute, registerDeckRoute],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focus();
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  return (
    <HeaderSearchContext.Provider value={value}>
      {children}
    </HeaderSearchContext.Provider>
  );
}

/**
 * Mounted by the deck page to register the current deck route + owner status
 * with the header search. Unmounting clears the signal.
 */
export function DeckRouteBridge({ deckId, isOwner }: DeckRouteSignal) {
  const { registerDeckRoute } = useHeaderSearch();
  useEffect(() => {
    registerDeckRoute({ deckId, isOwner });
    return () => registerDeckRoute(null);
  }, [registerDeckRoute, deckId, isOwner]);
  return null;
}
