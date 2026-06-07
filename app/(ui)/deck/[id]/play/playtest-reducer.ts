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

interface Lookahead {
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

  const newCastCount = entry.castCount + 1;
  const instanceId = entry.castCount > 0
    ? `${entry.card.instanceId}-cast${newCastCount}`
    : entry.card.instanceId;
  const card: PlaytestCard = {
    ...entry.card,
    instanceId,
    zone: "battlefield",
    tapped: false,
  };

  const newCommanders = state.commanders.map((e, i) =>
    i === idx ? { ...e, castCount: newCastCount, card: { ...e.card, zone: "battlefield" as PlaytestZone } } : e,
  );

  return withPrev(state, {
    ...snapshot(state),
    commanders: newCommanders,
    battlefield: [...state.battlefield, card],
  });
}

type ActionHandlers = {
  [A in PlaytestAction as A["type"]]: (state: PlaytestState, action: A) => PlaytestState;
};

const handlers: ActionHandlers = {
  draw: (state) => {
    if (state.library.length === 0) return state;
    const [top, ...rest] = state.library;
    return withPrev(state, {
      ...snapshot(state),
      library: rest,
      hand: [...state.hand, { ...top!, zone: "hand" }],
    });
  },

  mulliganTo: (state, action) => {
    const { n } = action;
    const prng = mulberry32(state.seed + state.turn * 1000 + n);
    const all = [
      ...state.hand.map((c) => ({ ...c, zone: "library" as PlaytestZone })),
      ...state.library,
    ];
    const shuffled = shuffleDeck(all, prng);
    const newHand = shuffled.slice(0, n).map((c) => ({ ...c, zone: "hand" as PlaytestZone }));
    const newLib = shuffled.slice(n).map((c) => ({ ...c, zone: "library" as PlaytestZone }));
    return withPrev(state, { ...snapshot(state), library: newLib, hand: newHand });
  },

  shuffleLibrary: (state) => {
    const prng = mulberry32(state.seed + Date.now());
    return withPrev(state, { ...snapshot(state), library: shuffleDeck(state.library, prng) });
  },

  startLookahead: (state, action) => {
    if (state.library.length === 0) return state;
    return { ...state, lookahead: { mode: action.mode, cards: state.library.slice(0, action.n) } };
  },

  resolveLookahead: (state, action) => {
    if (!state.lookahead) return state;
    const { mode } = state.lookahead;
    const placedIds = new Set(action.placements.map((p) => p.id));
    const libraryMap = new Map(state.library.map((c) => [c.instanceId, c]));
    const baseState = { ...state, lookahead: null };
    const rest = state.library.filter((c) => !placedIds.has(c.instanceId));
    const pick = (keep: (dest: LookaheadDest) => boolean) =>
      action.placements.filter((p) => keep(p.dest)).map((p) => libraryMap.get(p.id)!).filter(Boolean);

    if (mode === "scry") {
      const top = pick((d) => d !== "bottom");
      const bottom = pick((d) => d === "bottom");
      return withPrev(baseState, { ...snapshot(baseState), library: [...top, ...rest, ...bottom] });
    }

    // mode === "surveil" (LookaheadMode is exhaustive; scry already returned)
    const top = pick((d) => d !== "graveyard");
    const toGrave = pick((d) => d === "graveyard");
    return withPrev(baseState, {
      ...snapshot(baseState),
      library: [...top, ...rest],
      graveyard: [...state.graveyard, ...toGrave.map((c) => ({ ...c, zone: "graveyard" as PlaytestZone }))],
    });
  },

  moveToTop: (state, action) => {
    const idx = state.library.findIndex((c) => c.instanceId === action.id);
    if (idx <= 0) return state;
    const card = state.library[idx]!;
    return withPrev(state, {
      ...snapshot(state),
      library: [card, ...state.library.filter((_, i) => i !== idx)],
    });
  },

  moveToBottom: (state, action) => {
    const idx = state.library.findIndex((c) => c.instanceId === action.id);
    if (idx < 0 || idx === state.library.length - 1) return state;
    const card = state.library[idx]!;
    return withPrev(state, {
      ...snapshot(state),
      library: [...state.library.filter((_, i) => i !== idx), card],
    });
  },

  reorderLibrary: (state, action) => {
    const { fromIndex, toIndex } = action;
    const len = state.library.length;
    const invalid =
      fromIndex === toIndex ||
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= len ||
      toIndex >= len;
    if (invalid) return state;
    const newLib = [...state.library];
    const [moved] = newLib.splice(fromIndex, 1);
    newLib.splice(toIndex, 0, moved!);
    return withPrev(state, { ...snapshot(state), library: newLib });
  },

  mill: (state, action) => {
    const toMill = state.library.slice(0, action.n);
    if (toMill.length === 0) return state;
    return withPrev(state, {
      ...snapshot(state),
      library: state.library.slice(action.n),
      graveyard: [...state.graveyard, ...toMill.map((c) => ({ ...c, zone: "graveyard" as PlaytestZone }))],
    });
  },

  tapCard: (state, action) => setTapped(state, action.id, true),

  untapCard: (state, action) => setTapped(state, action.id, false),

  untapAll: (state) =>
    withPrev(state, {
      ...snapshot(state),
      battlefield: state.battlefield.map((c) => ({ ...c, tapped: false })),
    }),

  sendTo: (state, action) => withPrev(state, moveCard(state, action.id, action.zone)),

  castCommander: (state, action) => castCommander(state, action.idx),

  decrementTax: (state, action) => {
    const newCommanders = state.commanders.map((e, i) =>
      i === action.idx ? { ...e, castCount: Math.max(0, e.castCount - 1) } : e,
    );
    return withPrev(state, { ...snapshot(state), commanders: newCommanders });
  },

  nextTurn: (state) => {
    const topCard = state.library[0];
    const newHand = topCard ? [...state.hand, { ...topCard, zone: "hand" as PlaytestZone }] : state.hand;
    return withPrev(state, {
      ...snapshot(state),
      turn: state.turn + 1,
      battlefield: state.battlefield.map((c) => ({ ...c, tapped: false })),
      library: topCard ? state.library.slice(1) : state.library,
      hand: newHand,
    });
  },

  setLifeTotal: (state, action) =>
    withPrev(state, { ...snapshot(state), lifeTotal: action.n }),

  undo: (state) => (state.prev ? { ...state.prev, prev: null } : state),

  resetGame: (state) =>
    initGame(state.deckId, state.commanders, [
      ...state.library,
      ...state.hand,
      ...state.battlefield,
      ...state.graveyard,
      ...state.exile,
    ]),

  restoreState: (_state, action) => action.state,
};

function setTapped(state: PlaytestState, id: string, tapped: boolean): PlaytestState {
  return withPrev(state, {
    ...snapshot(state),
    battlefield: state.battlefield.map((c) => (c.instanceId === id ? { ...c, tapped } : c)),
  });
}

export function playtestReducer(state: PlaytestState, action: PlaytestAction): PlaytestState {
  const handler = handlers[action.type] as (s: PlaytestState, a: PlaytestAction) => PlaytestState;
  /* v8 ignore next -- PlaytestAction union is exhaustive */
  return handler ? handler(state, action) : state;
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
