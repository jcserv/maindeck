import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  playtestReducer,
  initGame,
  saveToSession,
  loadFromSession,
  type PlaytestCard,
  type PlaytestState,
  type CommanderEntry,
} from "../playtest-reducer";

function makeCard(id: string, overrides: Partial<PlaytestCard> = {}): PlaytestCard {
  return {
    instanceId: id,
    deckCardId: id,
    name: `Card ${id}`,
    manaCost: "{1}",
    cmc: 1,
    typeLine: "Creature",
    imageUri: null,
    gameChanger: false,
    tapped: false,
    zone: "library",
    ...overrides,
  };
}

function makeState(overrides: Partial<PlaytestState> = {}): PlaytestState {
  return {
    deckId: "deck-1",
    seed: 1,
    turn: 1,
    library: [makeCard("lib-1"), makeCard("lib-2"), makeCard("lib-3")],
    hand: [makeCard("hand-1", { zone: "hand" })],
    battlefield: [],
    graveyard: [],
    exile: [],
    commanders: [],
    lifeTotal: 40,
    lookahead: null,
    prev: null,
    ...overrides,
  };
}

describe("playtestReducer", () => {
  describe("draw", () => {
    it("moves top library card to hand", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "draw" });
      expect(next.library).toHaveLength(2);
      expect(next.hand).toHaveLength(2);
      expect(next.hand[1]!.instanceId).toBe("lib-1");
      expect(next.hand[1]!.zone).toBe("hand");
    });

    it("no-ops on empty library", () => {
      const state = makeState({ library: [] });
      const next = playtestReducer(state, { type: "draw" });
      expect(next).toBe(state);
    });

    it("saves prev for undo", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "draw" });
      expect(next.prev).not.toBeNull();
    });
  });

  describe("mulliganTo", () => {
    it("returns n cards to hand, rest to library", () => {
      const allCards = Array.from({ length: 7 }, (_, i) => makeCard(`c${i}`));
      const state = makeState({ hand: allCards.slice(0, 7), library: [] });
      const next = playtestReducer(state, { type: "mulliganTo", n: 6 });
      expect(next.hand).toHaveLength(6);
      expect(next.library).toHaveLength(1);
      expect(next.hand.every((c) => c.zone === "hand")).toBe(true);
      expect(next.library.every((c) => c.zone === "library")).toBe(true);
    });

    it("saves prev for undo", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "mulliganTo", n: 2 });
      expect(next.prev).not.toBeNull();
    });
  });

  describe("shuffleLibrary", () => {
    it("keeps same cards, same count", () => {
      const state = makeState({
        library: Array.from({ length: 10 }, (_, i) => makeCard(`l${i}`)),
      });
      const next = playtestReducer(state, { type: "shuffleLibrary" });
      expect(next.library).toHaveLength(10);
      const ids = new Set(next.library.map((c) => c.instanceId));
      expect(ids.size).toBe(10);
    });

    it("saves prev for undo", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "shuffleLibrary" });
      expect(next.prev).not.toBeNull();
    });
  });

  describe("startLookahead", () => {
    it("sets lookahead with top n cards", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "startLookahead", mode: "scry", n: 2 });
      expect(next.lookahead).not.toBeNull();
      expect(next.lookahead!.mode).toBe("scry");
      expect(next.lookahead!.cards).toHaveLength(2);
      expect(next.lookahead!.cards[0]!.instanceId).toBe("lib-1");
    });

    it("no-ops on empty library", () => {
      const state = makeState({ library: [] });
      const next = playtestReducer(state, { type: "startLookahead", mode: "scry", n: 2 });
      expect(next).toBe(state);
    });

    it("does not save prev (not undoable)", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "startLookahead", mode: "scry", n: 1 });
      expect(next.prev).toBeNull();
    });
  });

  describe("resolveLookahead - scry", () => {
    it("keeps top cards at top, bottom cards at bottom", () => {
      const lib = [makeCard("a"), makeCard("b"), makeCard("c"), makeCard("d")];
      const state = makeState({
        library: lib,
        lookahead: { mode: "scry", cards: [lib[0]!, lib[1]!] },
      });
      const next = playtestReducer(state, {
        type: "resolveLookahead",
        placements: [
          { id: "a", dest: "top" },
          { id: "b", dest: "bottom" },
        ],
      });
      expect(next.lookahead).toBeNull();
      expect(next.library[0]!.instanceId).toBe("a");
      expect(next.library[next.library.length - 1]!.instanceId).toBe("b");
    });

    it("no-ops when no lookahead", () => {
      const state = makeState({ lookahead: null });
      const next = playtestReducer(state, { type: "resolveLookahead", placements: [] });
      expect(next).toBe(state);
    });
  });

  describe("resolveLookahead - surveil", () => {
    it("sends graveyard cards to graveyard, rest stay on top", () => {
      const lib = [makeCard("a"), makeCard("b"), makeCard("c")];
      const state = makeState({
        library: lib,
        lookahead: { mode: "surveil", cards: [lib[0]!, lib[1]!] },
      });
      const next = playtestReducer(state, {
        type: "resolveLookahead",
        placements: [
          { id: "a", dest: "top" },
          { id: "b", dest: "graveyard" },
        ],
      });
      expect(next.library[0]!.instanceId).toBe("a");
      expect(next.graveyard).toHaveLength(1);
      expect(next.graveyard[0]!.instanceId).toBe("b");
      expect(next.graveyard[0]!.zone).toBe("graveyard");
    });
  });

  describe("moveToTop", () => {
    it("moves card from mid-library to index 0", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "moveToTop", id: "lib-2" });
      expect(next.library[0]!.instanceId).toBe("lib-2");
    });

    it("no-ops when card already at top", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "moveToTop", id: "lib-1" });
      expect(next).toBe(state);
    });
  });

  describe("moveToBottom", () => {
    it("moves card to last position", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "moveToBottom", id: "lib-1" });
      expect(next.library[next.library.length - 1]!.instanceId).toBe("lib-1");
    });

    it("no-ops when card already at bottom", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "moveToBottom", id: "lib-3" });
      expect(next).toBe(state);
    });

    it("no-ops when card not found", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "moveToBottom", id: "nonexistent" });
      expect(next).toBe(state);
    });
  });

  describe("reorderLibrary", () => {
    it("moves card from fromIndex to toIndex", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "reorderLibrary", fromIndex: 0, toIndex: 2 });
      expect(next.library[2]!.instanceId).toBe("lib-1");
      expect(next.library[0]!.instanceId).toBe("lib-2");
    });

    it("no-ops when indices equal", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "reorderLibrary", fromIndex: 1, toIndex: 1 });
      expect(next).toBe(state);
    });
  });

  describe("mill", () => {
    it("moves top n cards to graveyard", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "mill", n: 2 });
      expect(next.library).toHaveLength(1);
      expect(next.graveyard).toHaveLength(2);
      expect(next.graveyard[0]!.zone).toBe("graveyard");
    });

    it("no-ops on empty library", () => {
      const state = makeState({ library: [] });
      const next = playtestReducer(state, { type: "mill", n: 1 });
      expect(next).toBe(state);
    });
  });

  describe("tapCard", () => {
    it("taps target card on battlefield", () => {
      const state = makeState({
        battlefield: [makeCard("bf-1", { zone: "battlefield" })],
      });
      const next = playtestReducer(state, { type: "tapCard", id: "bf-1" });
      expect(next.battlefield[0]!.tapped).toBe(true);
    });
  });

  describe("untapCard", () => {
    it("untaps target card on battlefield", () => {
      const state = makeState({
        battlefield: [makeCard("bf-1", { zone: "battlefield", tapped: true })],
      });
      const next = playtestReducer(state, { type: "untapCard", id: "bf-1" });
      expect(next.battlefield[0]!.tapped).toBe(false);
    });
  });

  describe("untapAll", () => {
    it("untaps all battlefield cards", () => {
      const state = makeState({
        battlefield: [
          makeCard("bf-1", { zone: "battlefield", tapped: true }),
          makeCard("bf-2", { zone: "battlefield", tapped: true }),
        ],
      });
      const next = playtestReducer(state, { type: "untapAll" });
      expect(next.battlefield.every((c) => !c.tapped)).toBe(true);
    });
  });

  describe("sendTo", () => {
    it("moves hand card to graveyard", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "sendTo", id: "hand-1", zone: "graveyard" });
      expect(next.hand).toHaveLength(0);
      expect(next.graveyard).toHaveLength(1);
      expect(next.graveyard[0]!.zone).toBe("graveyard");
    });

    it("clears tapped status when leaving battlefield", () => {
      const state = makeState({
        battlefield: [makeCard("bf-1", { zone: "battlefield", tapped: true })],
      });
      const next = playtestReducer(state, { type: "sendTo", id: "bf-1", zone: "hand" });
      expect(next.hand[next.hand.length - 1]!.tapped).toBe(false);
    });

    it("no-ops when card not found", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "sendTo", id: "nonexistent", zone: "exile" });
      expect(next.exile).toHaveLength(0);
    });
  });

  describe("castCommander", () => {
    it("puts commander on battlefield and increments cast count", () => {
      const cmd: CommanderEntry = { card: makeCard("cmd-1"), castCount: 0 };
      const state = makeState({ commanders: [cmd] });
      const next = playtestReducer(state, { type: "castCommander", idx: 0 });
      expect(next.battlefield).toHaveLength(1);
      expect(next.battlefield[0]!.zone).toBe("battlefield");
      expect(next.commanders[0]!.castCount).toBe(1);
    });

    it("uses unique instanceId on subsequent casts", () => {
      const cmd: CommanderEntry = { card: makeCard("cmd-1"), castCount: 1 };
      const state = makeState({ commanders: [cmd] });
      const next = playtestReducer(state, { type: "castCommander", idx: 0 });
      expect(next.battlefield[0]!.instanceId).toBe("cmd-1-cast2");
    });

    it("no-ops for out-of-range idx", () => {
      const state = makeState({ commanders: [] });
      const next = playtestReducer(state, { type: "castCommander", idx: 5 });
      expect(next).toBe(state);
    });
  });

  describe("decrementTax", () => {
    it("decrements commander cast count", () => {
      const cmd: CommanderEntry = { card: makeCard("cmd-1"), castCount: 2 };
      const state = makeState({ commanders: [cmd] });
      const next = playtestReducer(state, { type: "decrementTax", idx: 0 });
      expect(next.commanders[0]!.castCount).toBe(1);
    });

    it("does not go below 0", () => {
      const cmd: CommanderEntry = { card: makeCard("cmd-1"), castCount: 0 };
      const state = makeState({ commanders: [cmd] });
      const next = playtestReducer(state, { type: "decrementTax", idx: 0 });
      expect(next.commanders[0]!.castCount).toBe(0);
    });
  });

  describe("nextTurn", () => {
    it("increments turn, draws top card, untaps battlefield", () => {
      const state = makeState({
        battlefield: [makeCard("bf-1", { zone: "battlefield", tapped: true })],
      });
      const next = playtestReducer(state, { type: "nextTurn" });
      expect(next.turn).toBe(2);
      expect(next.hand).toHaveLength(2);
      expect(next.library).toHaveLength(2);
      expect(next.battlefield[0]!.tapped).toBe(false);
    });

    it("does not draw when library empty", () => {
      const state = makeState({ library: [] });
      const next = playtestReducer(state, { type: "nextTurn" });
      expect(next.hand).toHaveLength(1);
    });
  });

  describe("setLifeTotal", () => {
    it("updates life total", () => {
      const state = makeState();
      const next = playtestReducer(state, { type: "setLifeTotal", n: 35 });
      expect(next.lifeTotal).toBe(35);
    });
  });

  describe("undo", () => {
    it("restores previous state", () => {
      const state = makeState();
      const after = playtestReducer(state, { type: "draw" });
      const undone = playtestReducer(after, { type: "undo" });
      expect(undone.library).toHaveLength(3);
      expect(undone.hand).toHaveLength(1);
      expect(undone.prev).toBeNull();
    });

    it("no-ops when no prev", () => {
      const state = makeState({ prev: null });
      const next = playtestReducer(state, { type: "undo" });
      expect(next).toBe(state);
    });
  });

  describe("resetGame", () => {
    it("puts all cards back and shuffles", () => {
      const state = makeState({
        hand: [makeCard("h1", { zone: "hand" })],
        battlefield: [makeCard("bf1", { zone: "battlefield" })],
        graveyard: [makeCard("gr1", { zone: "graveyard" })],
        exile: [makeCard("ex1", { zone: "exile" })],
      });
      const next = playtestReducer(state, { type: "resetGame" });
      const total = next.hand.length + next.library.length;
      // original: 3 lib + 1 hand + 1 bf + 1 gr + 1 exile = 7 cards
      expect(total).toBe(7);
      expect(next.turn).toBe(1);
    });
  });

  describe("restoreState", () => {
    it("replaces state entirely", () => {
      const state = makeState();
      const saved = makeState({ turn: 99, lifeTotal: 1 });
      const next = playtestReducer(state, { type: "restoreState", state: saved });
      expect(next.turn).toBe(99);
      expect(next.lifeTotal).toBe(1);
    });
  });
});

describe("initGame", () => {
  it("deals 7 cards to hand, rest to library", () => {
    const cards = Array.from({ length: 60 }, (_, i) => makeCard(`c${i}`));
    const state = initGame("deck-1", [], cards, 42);
    expect(state.hand).toHaveLength(7);
    expect(state.library).toHaveLength(53);
    expect(state.hand.every((c) => c.zone === "hand")).toBe(true);
    expect(state.library.every((c) => c.zone === "library")).toBe(true);
  });

  it("resets cast counts on commanders", () => {
    const cmd: CommanderEntry = { card: makeCard("cmd"), castCount: 3 };
    const state = initGame("deck-1", [cmd], [], 1);
    expect(state.commanders[0]!.castCount).toBe(0);
  });

  it("starts at turn 1, life 40", () => {
    const state = initGame("deck-1", [], [], 1);
    expect(state.turn).toBe(1);
    expect(state.lifeTotal).toBe(40);
    expect(state.lookahead).toBeNull();
    expect(state.prev).toBeNull();
  });

  it("uses provided seed for determinism", () => {
    const cards = Array.from({ length: 20 }, (_, i) => makeCard(`c${i}`));
    const a = initGame("d", [], cards, 777);
    const b = initGame("d", [], cards, 777);
    expect(a.hand.map((c) => c.instanceId)).toEqual(b.hand.map((c) => c.instanceId));
  });
});

describe("saveToSession / loadFromSession", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    Object.assign(mockStorage, {});
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips state through sessionStorage", () => {
    const state = makeState({ deckId: "deck-42" });
    saveToSession(state);
    const loaded = loadFromSession("deck-42");
    expect(loaded).not.toBeNull();
    expect(loaded!.deckId).toBe("deck-42");
    expect(loaded!.lifeTotal).toBe(40);
  });

  it("returns null for unknown deckId", () => {
    expect(loadFromSession("nonexistent")).toBeNull();
  });

  it("returns null on parse error", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => "not-json",
      setItem: () => {},
    });
    const result = loadFromSession("deck-1");
    expect(result).toBeNull();
  });

  it("swallows sessionStorage errors on save", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceededError"); },
    });
    expect(() => saveToSession(makeState())).not.toThrow();
  });
});
