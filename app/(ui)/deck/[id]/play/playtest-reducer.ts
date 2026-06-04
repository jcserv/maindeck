import { shuffleDeck } from "@/lib/deck/shuffle";
import { mulberry32 } from "./prng";

export type PlaytestZone = "library" | "hand" | "battlefield" | "graveyard" | "exile";

export interface PlaytestCard {
  instanceId: string;
  deckCardId: string;
  name: string;
  manaCost: string | null;
  cmc: number | null;
  typeLine: string | null;
  imageUri: string | null;
  gameChanger: boolean;
  tapped: boolean;
  zone: PlaytestZone;
}

export interface CommanderEntry {
  card: PlaytestCard;
  castCount: number;
}

export type LookaheadMode = "scry" | "surveil";

export type LookaheadDest = "top" | "bottom" | "graveyard";

export interface Lookahead {
  mode: LookaheadMode;
  cards: PlaytestCard[];
}

export interface PlaytestState {
  deckId: string;
  seed: number;
  turn: number;
  library: PlaytestCard[];
  hand: PlaytestCard[];
  battlefield: PlaytestCard[];
  graveyard: PlaytestCard[];
  exile: PlaytestCard[];
  commanders: CommanderEntry[];
  lifeTotal: number;
  lookahead: Lookahead | null;
  prev: Omit<PlaytestState, "prev"> | null;
}

export type PlaytestAction =
  | { type: "draw" }
  | { type: "mulliganTo"; n: number }
  | { type: "shuffleLibrary" }
  | { type: "startLookahead"; mode: LookaheadMode; n: number }
  | { type: "resolveLookahead"; placements: Array<{ id: string; dest: LookaheadDest }> }
  | { type: "tapCard"; id: string }
  | { type: "untapCard"; id: string }
  | { type: "untapAll" }
  | { type: "sendTo"; id: string; zone: PlaytestZone }
  | { type: "castCommander"; idx: number }
  | { type: "decrementTax"; idx: number }
  | { type: "nextTurn" }
  | { type: "setLifeTotal"; n: number }
  | { type: "mill"; n: number }
  | { type: "moveToTop"; id: string }
  | { type: "moveToBottom"; id: string }
  | { type: "reorderLibrary"; fromIndex: number; toIndex: number }
  | { type: "undo" }
  | { type: "resetGame" }
  | { type: "restoreState"; state: PlaytestState };

function snapshot(state: PlaytestState): Omit<PlaytestState, "prev"> {
  const { prev: _prev, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

function withPrev(state: PlaytestState, next: Omit<PlaytestState, "prev">): PlaytestState {
  return { ...next, prev: snapshot(state) };
}

function moveCard(
  state: PlaytestState,
  id: string,
  toZone: PlaytestZone,
): Omit<PlaytestState, "prev"> {
  const zones: PlaytestZone[] = ["library", "hand", "battlefield", "graveyard", "exile"];
  let card: PlaytestCard | undefined;

  const updated: Pick<PlaytestState, PlaytestZone> = {
    library: state.library,
    hand: state.hand,
    battlefield: state.battlefield,
    graveyard: state.graveyard,
    exile: state.exile,
  };

  for (const z of zones) {
    const idx = updated[z].findIndex((c) => c.instanceId === id);
    if (idx !== -1) {
      card = { ...updated[z][idx]! };
      updated[z] = updated[z].filter((c) => c.instanceId !== id);
      break;
    }
  }

  if (!card) return snapshot(state);

  card.zone = toZone;
  if (toZone !== "battlefield") card.tapped = false;
  updated[toZone] = [...updated[toZone], card];

  const { prev: _prev, ...rest } = state;
  return { ...rest, ...updated };
}

function castCommander(state: PlaytestState, idx: number): PlaytestState {
  const entry = state.commanders[idx];
  if (!entry) return state;

  // Transfer the commander to battlefield (single game piece, not a clone)
  const card: PlaytestCard = {
    ...entry.card,
    zone: "battlefield",
    tapped: false,
  };

  const newCommanders = state.commanders.map((e, i) =>
    i === idx ? { ...e, castCount: e.castCount + 1, card: { ...e.card, zone: "battlefield" } } : e,
  );

  return withPrev(state, {
    ...snapshot(state),
    commanders: newCommanders,
    battlefield: [...state.battlefield, card],
  });
}

export function playtestReducer(state: PlaytestState, action: PlaytestAction): PlaytestState {
  switch (action.type) {
    case "draw": {
      if (state.library.length === 0) return state;
      const [top, ...rest] = state.library;
      return withPrev(state, {
        ...snapshot(state),
        library: rest,
        hand: [...state.hand, { ...top!, zone: "hand" }],
      });
    }

    case "mulliganTo": {
      const { n } = action;
      const prng = mulberry32(state.seed + state.turn * 1000 + n);
      const all = [
        ...state.hand.map((c) => ({ ...c, zone: "library" as PlaytestZone })),
        ...state.library,
      ];
      const shuffled = shuffleDeck(all, prng);
      const newHand = shuffled.slice(0, n).map((c) => ({ ...c, zone: "hand" as PlaytestZone }));
      const newLib = shuffled.slice(n).map((c) => ({ ...c, zone: "library" as PlaytestZone }));
      return withPrev(state, {
        ...snapshot(state),
        library: newLib,
        hand: newHand,
      });
    }

    case "shuffleLibrary": {
      const prng = mulberry32(state.seed + Date.now());
      return withPrev(state, {
        ...snapshot(state),
        library: shuffleDeck(state.library, prng),
      });
    }

    case "startLookahead": {
      if (state.library.length === 0) return state;
      return { ...state, lookahead: { mode: action.mode, cards: state.library.slice(0, action.n) } };
    }

    case "resolveLookahead": {
      if (!state.lookahead) return state;
      const { mode } = state.lookahead;
      const placedIds = new Set(action.placements.map((p) => p.id));
      const libraryMap = new Map(state.library.map((c) => [c.instanceId, c]));
      const baseState = { ...state, lookahead: null };

      if (mode === "scry") {
        const top = action.placements.filter((p) => p.dest !== "bottom").map((p) => libraryMap.get(p.id)!).filter(Boolean);
        const bottom = action.placements.filter((p) => p.dest === "bottom").map((p) => libraryMap.get(p.id)!).filter(Boolean);
        const rest = state.library.filter((c) => !placedIds.has(c.instanceId));
        return withPrev(baseState, { ...snapshot(baseState), library: [...top, ...rest, ...bottom] });
      }

      if (mode === "surveil") {
        const top = action.placements.filter((p) => p.dest !== "graveyard").map((p) => libraryMap.get(p.id)!).filter(Boolean);
        const toGrave = action.placements.filter((p) => p.dest === "graveyard").map((p) => libraryMap.get(p.id)!).filter(Boolean);
        const rest = state.library.filter((c) => !placedIds.has(c.instanceId));
        return withPrev(baseState, {
          ...snapshot(baseState),
          library: [...top, ...rest],
          graveyard: [...state.graveyard, ...toGrave.map((c) => ({ ...c, zone: "graveyard" as PlaytestZone }))],
        });
      }

      return state;
    }

    case "moveToTop": {
      const idx = state.library.findIndex((c) => c.instanceId === action.id);
      if (idx <= 0) return state;
      const card = state.library[idx]!;
      return withPrev(state, {
        ...snapshot(state),
        library: [card, ...state.library.filter((_, i) => i !== idx)],
      });
    }

    case "moveToBottom": {
      const idx = state.library.findIndex((c) => c.instanceId === action.id);
      if (idx < 0 || idx === state.library.length - 1) return state;
      const card = state.library[idx]!;
      return withPrev(state, {
        ...snapshot(state),
        library: [...state.library.filter((_, i) => i !== idx), card],
      });
    }

    case "reorderLibrary": {
      const { fromIndex, toIndex } = action;
      // Validate indices
      if (
        fromIndex === toIndex ||
        !Number.isInteger(fromIndex) ||
        !Number.isInteger(toIndex) ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.library.length ||
        toIndex >= state.library.length
      ) {
        return state;
      }
      const newLib = [...state.library];
      const [moved] = newLib.splice(fromIndex, 1);
      newLib.splice(toIndex, 0, moved!);
      return withPrev(state, { ...snapshot(state), library: newLib });
    }

    case "mill": {
      const { n } = action;
      const toMill = state.library.slice(0, n);
      if (toMill.length === 0) return state;
      return withPrev(state, {
        ...snapshot(state),
        library: state.library.slice(n),
        graveyard: [...state.graveyard, ...toMill.map((c) => ({ ...c, zone: "graveyard" as PlaytestZone }))],
      });
    }

    case "tapCard": {
      const update = (cards: PlaytestCard[]) =>
        cards.map((c) => (c.instanceId === action.id ? { ...c, tapped: true } : c));
      return withPrev(state, {
        ...snapshot(state),
        battlefield: update(state.battlefield),
      });
    }

    case "untapCard": {
      const update = (cards: PlaytestCard[]) =>
        cards.map((c) => (c.instanceId === action.id ? { ...c, tapped: false } : c));
      return withPrev(state, {
        ...snapshot(state),
        battlefield: update(state.battlefield),
      });
    }

    case "untapAll": {
      return withPrev(state, {
        ...snapshot(state),
        battlefield: state.battlefield.map((c) => ({ ...c, tapped: false })),
      });
    }

    case "sendTo": {
      const next = moveCard(state, action.id, action.zone);
      return withPrev(state, next);
    }

    case "castCommander":
      return castCommander(state, action.idx);

    case "decrementTax": {
      const newCommanders = state.commanders.map((e, i) =>
        i === action.idx ? { ...e, castCount: Math.max(0, e.castCount - 1) } : e,
      );
      return withPrev(state, { ...snapshot(state), commanders: newCommanders });
    }

    case "nextTurn": {
      const topCard = state.library[0];
      const newLibrary = state.library.slice(1);
      const newHand = topCard ? [...state.hand, { ...topCard, zone: "hand" as PlaytestZone }] : state.hand;
      return withPrev(state, {
        ...snapshot(state),
        turn: state.turn + 1,
        battlefield: state.battlefield.map((c) => ({ ...c, tapped: false })),
        library: topCard ? newLibrary : state.library,
        hand: newHand,
      });
    }

    case "setLifeTotal": {
      return withPrev(state, { ...snapshot(state), lifeTotal: action.n });
    }

    case "undo": {
      if (!state.prev) return state;
      return { ...state.prev, prev: null };
    }

    case "resetGame": {
      return initGame(state.deckId, state.commanders, [
        ...state.library,
        ...state.hand,
        ...state.battlefield,
        ...state.graveyard,
        ...state.exile,
      ]);
    }

    case "restoreState":
      return action.state;

    default:
      return state;
  }
}

export function initGame(
  deckId: string,
  commanders: CommanderEntry[],
  allCards: PlaytestCard[],
  seed?: number,
): PlaytestState {
  const s = seed ?? (Date.now() & 0xffffffff);
  const prng = mulberry32(s);
  const shuffled = shuffleDeck(
    allCards.map((c) => ({ ...c, zone: "library" as PlaytestZone, tapped: false })),
    prng,
  );
  const hand = shuffled.slice(0, 7).map((c) => ({ ...c, zone: "hand" as PlaytestZone }));
  const library = shuffled.slice(7).map((c) => ({ ...c, zone: "library" as PlaytestZone }));

  return {
    deckId,
    seed: s,
    turn: 1,
    library,
    hand,
    battlefield: [],
    graveyard: [],
    exile: [],
    commanders: commanders.map((e) => ({ ...e, castCount: 0 })),
    lifeTotal: 40,
    lookahead: null,
    prev: null,
  };
}

const SESSION_PREFIX = "playtest:v2:";

export function saveToSession(state: PlaytestState): void {
  try {
    sessionStorage.setItem(SESSION_PREFIX + state.deckId, JSON.stringify(state));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

export function loadFromSession(deckId: string): PlaytestState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + deckId);
    return raw ? (JSON.parse(raw) as PlaytestState) : null;
  } catch {
    return null;
  }
}
