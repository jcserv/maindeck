import { describe, expect, it } from "vitest";
import {
  createGame,
  isEliminated,
  lifeCounterReducer,
  parseGame,
  type GameState,
} from "./state";

function game(overrides: Partial<Parameters<typeof createGame>[0]> = {}) {
  return createGame({ playerCount: 4, startingLife: 40, ...overrides });
}

function apply(state: GameState, ...actions: Parameters<typeof lifeCounterReducer>[1][]) {
  return actions.reduce(lifeCounterReducer, state);
}

describe("lifeCounterReducer — commander damage", () => {
  it("moves the life total in lockstep with commander damage", () => {
    const [target, source] = game().players;
    const next = apply(
      game(),
      { type: "adjustCommanderDamage", targetId: target!.id, sourceId: source!.id, delta: 3 },
      { type: "adjustCommanderDamage", targetId: target!.id, sourceId: source!.id, delta: -1 },
    );
    const updated = next.players[0]!;
    expect(updated.commanderDamage[source!.id]).toBe(2);
    expect(updated.life).toBe(38);
  });

  it("does not refund life when commander damage is already zero", () => {
    const [target, source] = game().players;
    const next = apply(game(), {
      type: "adjustCommanderDamage",
      targetId: target!.id,
      sourceId: source!.id,
      delta: -2,
    });
    expect(next.players[0]!.commanderDamage[source!.id] ?? 0).toBe(0);
    expect(next.players[0]!.life).toBe(40);
  });
});

describe("lifeCounterReducer — counters", () => {
  it("never lets a counter go negative", () => {
    const id = game().players[0]!.id;
    const next = apply(
      game(),
      { type: "adjustCounter", playerId: id, counter: "poison", delta: 1 },
      { type: "adjustCounter", playerId: id, counter: "poison", delta: -3 },
    );
    expect(next.players[0]!.counters.poison).toBe(0);
  });
});

describe("lifeCounterReducer — table setup", () => {
  it("keeps existing players when growing and drops their damage from removed sources when shrinking", () => {
    const start = game();
    const [a, , , d] = start.players;
    const played = apply(
      start,
      { type: "adjustLife", playerId: a!.id, delta: -5 },
      { type: "adjustCommanderDamage", targetId: a!.id, sourceId: d!.id, delta: 4 },
      { type: "setFirstPlayer", playerId: d!.id },
    );

    const shrunk = apply(played, { type: "setPlayerCount", count: 3 });
    expect(shrunk.players).toHaveLength(3);
    expect(shrunk.players[0]!.life).toBe(31);
    expect(shrunk.players[0]!.commanderDamage[d!.id]).toBeUndefined();
    expect(shrunk.firstPlayerId).toBeNull();

    const grown = apply(shrunk, { type: "setPlayerCount", count: 5 });
    expect(grown.players).toHaveLength(5);
    expect(new Set(grown.players.map((p) => p.id)).size).toBe(5);
    expect(grown.players[4]!.life).toBe(40);
  });

  it("restarts every player at the new starting life, keeping names", () => {
    const start = game();
    const id = start.players[0]!.id;
    const next = apply(
      start,
      { type: "renamePlayer", playerId: id, name: "Ana" },
      { type: "adjustCounter", playerId: id, counter: "poison", delta: 2 },
      { type: "setStartingLife", life: 20 },
    );
    expect(next.startingLife).toBe(20);
    expect(next.players.every((p) => p.life === 20)).toBe(true);
    expect(next.players[0]!.name).toBe("Ana");
    expect(next.players[0]!.counters.poison).toBe(0);
  });

  it("picks the first player from the random source", () => {
    const start = game();
    const next = apply(start, { type: "randomizeFirstPlayer", roll: 0.6 });
    expect(next.firstPlayerId).toBe(start.players[2]!.id);
  });
});

describe("isEliminated", () => {
  it.each([
    ["life at zero", { life: 0 }],
    ["ten poison", { counters: { poison: 10, energy: 0, experience: 0, tax: 0 } }],
    ["21 damage from one commander", { commanderDamage: { 7: 21 } }],
  ])("is true for %s", (_label, patch) => {
    expect(isEliminated({ ...game().players[0]!, ...patch })).toBe(true);
  });

  it("does not sum commander damage across sources", () => {
    expect(
      isEliminated({ ...game().players[0]!, life: 10, commanderDamage: { 1: 15, 2: 15 } }),
    ).toBe(false);
  });
});

describe("parseGame", () => {
  it("round-trips a serialized game", () => {
    const state = apply(game(), { type: "setLayout", layout: "grid" });
    expect(parseGame(JSON.stringify(state))).toEqual(state);
  });

  it.each([null, "not json", JSON.stringify({ players: "nope" })])(
    "returns null for unusable input %#",
    (raw) => {
      expect(parseGame(raw)).toBeNull();
    },
  );
});
