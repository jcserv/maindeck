"use client";

import { useState } from "react";
import { Crown, Hash, Heart, Minus, Plus, Skull, Swords, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COUNTERS,
  isEliminated,
  type CounterKind,
  type GameState,
  type LifeCounterAction,
  type Player,
} from "@/lib/life-counter/state";

type Mode = "life" | "commander" | "counters";

const MODES: { value: Mode; label: string; Icon: LucideIcon }[] = [
  { value: "life", label: "Life", Icon: Heart },
  { value: "commander", label: "Commander dmg", Icon: Swords },
  { value: "counters", label: "Counters", Icon: Hash },
];

const COUNTER_LABELS: Record<CounterKind, string> = {
  poison: "Poison",
  energy: "Energy",
  experience: "Experience",
  tax: "Commander tax",
};

const SEAT_TINTS = [
  "bg-rose-500/10 border-rose-500/30",
  "bg-sky-500/10 border-sky-500/30",
  "bg-emerald-500/10 border-emerald-500/30",
  "bg-amber-500/10 border-amber-500/30",
  "bg-violet-500/10 border-violet-500/30",
  "bg-teal-500/10 border-teal-500/30",
];

type Dispatch = (action: LifeCounterAction) => void;

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <span className="line-clamp-2 min-w-0 break-words text-sm text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(-1)}
          className="grid size-7 place-items-center rounded-md hover:bg-foreground/10"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="w-7 text-center text-lg font-semibold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(1)}
          className="grid size-7 place-items-center rounded-md hover:bg-foreground/10"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function LifeView({ player, dispatch }: { player: Player; dispatch: Dispatch }) {
  const adjust = (delta: number) =>
    dispatch({ type: "adjustLife", playerId: player.id, delta });
  return (
    <div className="relative flex flex-1 items-stretch">
      <button
        type="button"
        aria-label={`Decrease ${player.name} life`}
        onClick={() => adjust(-1)}
        className="flex flex-1 items-center justify-start pl-1.5 @[11rem]:pl-3 text-muted-foreground hover:bg-foreground/5 rounded-l-lg"
      >
        <Minus className="size-4 @[11rem]:size-6" aria-hidden />
      </button>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span
          className="text-4xl font-bold tabular-nums @[11rem]:text-6xl @[22rem]:text-7xl"
          aria-live="polite"
          aria-label={`${player.name} life`}
        >
          {player.life}
        </span>
      </div>
      <button
        type="button"
        aria-label={`Increase ${player.name} life`}
        onClick={() => adjust(1)}
        className="flex flex-1 items-center justify-end pr-1.5 @[11rem]:pr-3 text-muted-foreground hover:bg-foreground/5 rounded-r-lg"
      >
        <Plus className="size-4 @[11rem]:size-6" aria-hidden />
      </button>
      <div className="absolute inset-x-0 bottom-1 flex justify-center gap-2">
        {[-5, 5].map((delta) => (
          <button
            key={delta}
            type="button"
            onClick={() => adjust(delta)}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>
    </div>
  );
}

function CommanderView({
  player,
  opponents,
  dispatch,
}: {
  player: Player;
  opponents: Player[];
  dispatch: Dispatch;
}) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-1 overflow-y-auto px-2 @[11rem]:px-3">
      <p className="hidden text-xs text-muted-foreground @[14rem]:block">
        Damage taken from each commander. Also adjusts life ({player.life}).
      </p>
      {opponents.map((source) => (
        <Stepper
          key={source.id}
          label={source.name}
          value={player.commanderDamage[source.id] ?? 0}
          onChange={(delta) =>
            dispatch({
              type: "adjustCommanderDamage",
              targetId: player.id,
              sourceId: source.id,
              delta,
            })
          }
        />
      ))}
    </div>
  );
}

function CountersView({ player, dispatch }: { player: Player; dispatch: Dispatch }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-1 overflow-y-auto px-2 @[11rem]:px-3">
      {COUNTERS.map((counter) => (
        <Stepper
          key={counter}
          label={COUNTER_LABELS[counter]}
          value={player.counters[counter]}
          onChange={(delta) =>
            dispatch({ type: "adjustCounter", playerId: player.id, counter, delta })
          }
        />
      ))}
    </div>
  );
}

function PanelHeader({
  player,
  isFirst,
  eliminated,
  dispatch,
}: {
  player: Player;
  isFirst: boolean;
  eliminated: boolean;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2">
      {isFirst && (
        <Crown className="size-4 shrink-0 text-amber-500" aria-label="Goes first" />
      )}
      <input
        value={player.name}
        aria-label="Player name"
        maxLength={24}
        onChange={(e) =>
          dispatch({ type: "renamePlayer", playerId: player.id, name: e.target.value })
        }
        className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold outline-none focus-visible:underline"
      />
      {eliminated && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
          <Skull className="size-3.5" aria-hidden />
          Out
        </span>
      )}
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="flex justify-center gap-1 px-2 pb-2" role="tablist">
      {MODES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          aria-label={label}
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
            mode === value
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="hidden @[17rem]:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function PlayerPanel({
  game,
  player,
  seat,
  rotated,
  dispatch,
}: {
  game: GameState;
  player: Player;
  seat: number;
  rotated: boolean;
  dispatch: Dispatch;
}) {
  const [mode, setMode] = useState<Mode>("life");
  const eliminated = isEliminated(player);
  const opponents = game.players.filter((p) => p.id !== player.id);

  return (
    <section
      aria-label={player.name}
      className={cn(
        "@container flex min-h-0 min-w-0 flex-col rounded-xl border transition-opacity",
        SEAT_TINTS[seat % SEAT_TINTS.length],
        rotated && "rotate-180",
        eliminated && "opacity-60",
      )}
    >
      <PanelHeader
        player={player}
        isFirst={game.firstPlayerId === player.id}
        eliminated={eliminated}
        dispatch={dispatch}
      />
      {mode === "life" && <LifeView player={player} dispatch={dispatch} />}
      {mode === "commander" && (
        <CommanderView player={player} opponents={opponents} dispatch={dispatch} />
      )}
      {mode === "counters" && <CountersView player={player} dispatch={dispatch} />}
      <ModeTabs mode={mode} onChange={setMode} />
    </section>
  );
}
