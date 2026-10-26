import { z } from "zod";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const STARTING_LIFE_PRESETS = [20, 30, 40] as const;
export const LAYOUTS = ["table", "grid"] as const;
export const COUNTERS = ["poison", "energy", "experience", "tax"] as const;

const POISON_LIMIT = 10;
const COMMANDER_DAMAGE_LIMIT = 21;

export type Layout = (typeof LAYOUTS)[number];
export type CounterKind = (typeof COUNTERS)[number];

const counterCount = z.number().int().min(0);

const playerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  life: z.number().int(),
  counters: z.object({
    poison: counterCount,
    energy: counterCount,
    experience: counterCount,
    tax: counterCount,
  }),
  commanderDamage: z.record(z.coerce.number().int(), counterCount),
});

const gameSchema = z.object({
  startingLife: z.number().int().positive(),
  layout: z.enum(LAYOUTS),
  firstPlayerId: z.number().int().nullable(),
  players: z.array(playerSchema).min(MIN_PLAYERS).max(MAX_PLAYERS),
});

export type Player = z.infer<typeof playerSchema>;
export type GameState = z.infer<typeof gameSchema>;

export type LifeCounterAction =
  | { type: "adjustLife"; playerId: number; delta: number }
  | { type: "adjustCounter"; playerId: number; counter: CounterKind; delta: number }
  | { type: "adjustCommanderDamage"; targetId: number; sourceId: number; delta: number }
  | { type: "renamePlayer"; playerId: number; name: string }
  | { type: "setPlayerCount"; count: number }
  | { type: "setStartingLife"; life: number }
  | { type: "setLayout"; layout: Layout }
  | { type: "setFirstPlayer"; playerId: number | null }
  | { type: "randomizeFirstPlayer"; roll: number }
  | { type: "reset" };

function createPlayer(id: number, life: number, name = `Player ${id}`): Player {
  return {
    id,
    name,
    life,
    counters: { poison: 0, energy: 0, experience: 0, tax: 0 },
    commanderDamage: {},
  };
}

export function createGame({
  playerCount,
  startingLife,
  layout = "table",
}: {
  playerCount: number;
  startingLife: number;
  layout?: Layout;
}): GameState {
  return {
    startingLife,
    layout,
    firstPlayerId: null,
    players: Array.from({ length: playerCount }, (_, i) =>
      createPlayer(i + 1, startingLife),
    ),
  };
}

export const DEFAULT_GAME = createGame({ playerCount: 4, startingLife: 40 });

export function isEliminated(player: Player): boolean {
  return (
    player.life <= 0 ||
    player.counters.poison >= POISON_LIMIT ||
    Object.values(player.commanderDamage).some((d) => d >= COMMANDER_DAMAGE_LIMIT)
  );
}

export function parseGame(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const result = gameSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function updatePlayer(
  state: GameState,
  playerId: number,
  update: (player: Player) => Player,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
  };
}

function restart(state: GameState, startingLife: number): GameState {
  return {
    ...state,
    startingLife,
    firstPlayerId: null,
    players: state.players.map((p) => createPlayer(p.id, startingLife, p.name)),
  };
}

function setPlayerCount(state: GameState, count: number): GameState {
  const clamped = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, count));
  const kept = state.players.slice(0, clamped);
  const keptIds = new Set(kept.map((p) => p.id));
  let nextId = Math.max(...state.players.map((p) => p.id)) + 1;
  const added = Array.from({ length: clamped - kept.length }, () =>
    createPlayer(nextId++, state.startingLife),
  );
  return {
    ...state,
    firstPlayerId:
      state.firstPlayerId !== null && keptIds.has(state.firstPlayerId)
        ? state.firstPlayerId
        : null,
    players: [
      ...kept.map((p) => ({
        ...p,
        commanderDamage: Object.fromEntries(
          Object.entries(p.commanderDamage).filter(([id]) => keptIds.has(Number(id))),
        ),
      })),
      ...added,
    ],
  };
}

function adjustCommanderDamage(
  state: GameState,
  { targetId, sourceId, delta }: Extract<LifeCounterAction, { type: "adjustCommanderDamage" }>,
): GameState {
  return updatePlayer(state, targetId, (p) => {
    const current = p.commanderDamage[sourceId] ?? 0;
    const next = Math.max(0, current + delta);
    return {
      ...p,
      life: p.life - (next - current),
      commanderDamage: { ...p.commanderDamage, [sourceId]: next },
    };
  });
}

export function lifeCounterReducer(
  state: GameState,
  action: LifeCounterAction,
): GameState {
  switch (action.type) {
    case "adjustLife":
      return updatePlayer(state, action.playerId, (p) => ({
        ...p,
        life: p.life + action.delta,
      }));
    case "adjustCounter":
      return updatePlayer(state, action.playerId, (p) => ({
        ...p,
        counters: {
          ...p.counters,
          [action.counter]: Math.max(0, p.counters[action.counter] + action.delta),
        },
      }));
    case "adjustCommanderDamage":
      return adjustCommanderDamage(state, action);
    case "renamePlayer":
      return updatePlayer(state, action.playerId, (p) => ({ ...p, name: action.name }));
    case "setPlayerCount":
      return setPlayerCount(state, action.count);
    case "setStartingLife":
      return restart(state, action.life);
    case "setLayout":
      return { ...state, layout: action.layout };
    case "setFirstPlayer":
      return { ...state, firstPlayerId: action.playerId };
    case "randomizeFirstPlayer": {
      const index = Math.floor(action.roll * state.players.length);
      return { ...state, firstPlayerId: state.players[index]?.id ?? null };
    }
    case "reset":
      return restart(state, state.startingLife);
  }
}
