"use client";

import { useEffect, useLayoutEffect, useReducer, useRef, useCallback, useState } from "react";
import {
  playtestReducer,
  initGame,
  saveToSession,
  loadFromSession,
  type PlaytestState,
  type PlaytestCard,
  type CommanderEntry,
} from "./playtest-reducer";
import { DesktopLayout } from "./_components/desktop-layout";
import { MobileLayout } from "./_components/mobile-layout";

interface DeckCardInput {
  id: string;
  quantity: number;
  zone: string;
  category: string | null;
  card: {
    id: string;
    name: string;
    manaCost: string | null;
    cmc: number | null;
    typeLine: string | null;
    gameChanger: boolean;
    printings: Array<{ imageUri: string | null }>;
  };
  printing: { imageUri: string | null } | null;
}

interface PlaytestClientProps {
  deckId: string;
  deckName: string;
  format: string;
  cards: DeckCardInput[];
}

function toPlaytestCard(dc: DeckCardInput, idx: number): PlaytestCard {
  const imageUri = dc.printing?.imageUri ?? dc.card.printings[0]?.imageUri ?? null;
  return {
    instanceId: `${dc.id}:${idx}`,
    deckCardId: dc.id,
    name: dc.card.name,
    manaCost: dc.card.manaCost,
    cmc: dc.card.cmc,
    typeLine: dc.card.typeLine,
    imageUri,
    gameChanger: dc.card.gameChanger,
    tapped: false,
    zone: "library",
  };
}

function buildInitialState(
  deckId: string,
  cards: DeckCardInput[],
  format: string,
): PlaytestState {
  const commanders: CommanderEntry[] = [];
  const libraryCards: PlaytestCard[] = [];

  for (const dc of cards) {
    if (dc.zone === "COMMANDER") {
      commanders.push({
        card: toPlaytestCard(dc, 0),
        castCount: 0,
      });
    } else if (dc.zone === "MAINBOARD") {
      for (let i = 0; i < dc.quantity; i++) {
        libraryCards.push(toPlaytestCard(dc, i));
      }
    }
  }

  const startingLife = format === "COMMANDER" || format === "BRAWL" ? 40 : 20;
  const state = initGame(deckId, commanders, libraryCards);
  return { ...state, lifeTotal: startingLife };
}

export function PlaytestClient({ deckId, deckName, format, cards }: PlaytestClientProps) {
  const [state, dispatch] = useReducer(
    playtestReducer,
    null,
    () => buildInitialState(deckId, cards, format),
  );

  // Restore session after mount so SSR and initial client render are identical
  useEffect(() => {
    const fromSession = loadFromSession(deckId);
    if (fromSession) dispatch({ type: "restoreState", state: fromSession });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveToSession(state);
  }, [state]);

  // Keybinds — keep latest refs in sync without adding them as effect deps
  const dispatchRef = useRef(dispatch);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    dispatchRef.current = dispatch;
    stateRef.current = state;
  });

  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const s = stateRef.current;
    switch (e.key.toLowerCase()) {
      case "d": dispatchRef.current({ type: "draw" }); break;
      case "u": dispatchRef.current({ type: "untapAll" }); break;
      case "n": dispatchRef.current({ type: "nextTurn" }); break;
      case "m": dispatchRef.current({ type: "mill", n: 1 }); break;
      case "s": dispatchRef.current({ type: "startLookahead", mode: "scry", n: 1 }); break;
      case "v": dispatchRef.current({ type: "startLookahead", mode: "surveil", n: 1 }); break;
      case "z": dispatchRef.current({ type: "undo" }); break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const layoutProps = {
    state,
    dispatch,
    deckName,
  };

  if (desktop) {
    return <DesktopLayout {...layoutProps} />;
  }
  return <MobileLayout {...layoutProps} />;
}
