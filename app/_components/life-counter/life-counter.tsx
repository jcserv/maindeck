"use client";

import { useState, type ReactNode } from "react";
import { Dices, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LAYOUTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_LIFE_PRESETS,
  type GameState,
  type Layout,
  type LifeCounterAction,
  type Player,
} from "@/lib/life-counter/state";
import { PlayerPanel } from "./player-panel";
import { useLifeCounter } from "./use-life-counter";

type Dispatch = (action: LifeCounterAction) => void;

const PLAYER_COUNTS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
);

const LAYOUT_LABELS: Record<Layout, string> = {
  table: "Around a table",
  grid: "All upright",
};

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format = String,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  format?: (value: T) => ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={option === value ? "secondary" : "ghost"}
          role="radio"
          aria-checked={option === value}
          onClick={() => onChange(option)}
        >
          {format(option)}
        </Button>
      ))}
    </div>
  );
}

function StartingLifeField({ game, dispatch }: { game: GameState; dispatch: Dispatch }) {
  const [custom, setCustom] = useState("");
  const isPreset = (STARTING_LIFE_PRESETS as readonly number[]).includes(game.startingLife);

  function submitCustom() {
    const life = Number.parseInt(custom, 10);
    if (Number.isInteger(life) && life > 0) {
      dispatch({ type: "setStartingLife", life });
      setCustom("");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Segmented
        label="Starting life"
        options={STARTING_LIFE_PRESETS}
        value={isPreset ? (game.startingLife as (typeof STARTING_LIFE_PRESETS)[number]) : null}
        onChange={(life) => dispatch({ type: "setStartingLife", life })}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCustom();
        }}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          aria-label="Custom starting life"
          placeholder={isPreset ? "Custom" : String(game.startingLife)}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={submitCustom}
          className="h-7 w-24"
        />
      </form>
    </div>
  );
}

function SettingsField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Eyebrow>{label}</Eyebrow>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SettingsPopover({ game, dispatch }: { game: GameState; dispatch: Dispatch }) {
  const playerIds = game.players.map((p) => p.id);
  const nameById = new Map(game.players.map((p) => [p.id, p.name]));
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <Settings2 aria-hidden />
        <span className="max-sm:sr-only">Settings</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4">
        <SettingsField label="Players">
          <Segmented
            label="Players"
            options={PLAYER_COUNTS}
            value={game.players.length}
            onChange={(count) => dispatch({ type: "setPlayerCount", count })}
          />
        </SettingsField>
        <SettingsField label="Starting life" hint="Changing starting life starts a new game.">
          <StartingLifeField game={game} dispatch={dispatch} />
        </SettingsField>
        <SettingsField label="Layout">
          <Segmented
            label="Layout"
            options={LAYOUTS}
            value={game.layout}
            onChange={(layout) => dispatch({ type: "setLayout", layout })}
            format={(layout) => LAYOUT_LABELS[layout]}
          />
        </SettingsField>
        <SettingsField label="Goes first">
          <Segmented
            label="Goes first"
            options={playerIds}
            value={game.firstPlayerId}
            onChange={(playerId) => dispatch({ type: "setFirstPlayer", playerId })}
            format={(id) => nameById.get(id)}
          />
        </SettingsField>
      </PopoverContent>
    </Popover>
  );
}

function Toolbar({ game, dispatch }: { game: GameState; dispatch: Dispatch }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-lg font-semibold">Life counter</h1>
      <Button
        variant="outline"
        size="sm"
        onClick={() => dispatch({ type: "randomizeFirstPlayer", roll: Math.random() })}
      >
        <Dices aria-hidden />
        <span className="max-sm:sr-only">Random first</span>
      </Button>
      <ConfirmDialog
        title="Reset game?"
        description={`Every player goes back to ${game.startingLife} life and all counters are cleared.`}
        confirmLabel="Reset"
        onConfirm={() => dispatch({ type: "reset" })}
        trigger={
          <Button variant="outline" size="sm">
            <RotateCcw aria-hidden />
            <span className="max-sm:sr-only">Reset</span>
          </Button>
        }
      />
      <SettingsPopover game={game} dispatch={dispatch} />
    </div>
  );
}

function boardRows(game: GameState): { players: Player[]; rotated: boolean }[] {
  const { players, layout } = game;
  if (layout === "grid") {
    const perRow = players.length <= 2 ? players.length : players.length <= 4 ? 2 : 3;
    const rows = [];
    for (let i = 0; i < players.length; i += perRow) {
      rows.push({ players: players.slice(i, i + perRow), rotated: false });
    }
    return rows;
  }
  const split = Math.floor(players.length / 2);
  return [
    { players: players.slice(0, split), rotated: true },
    { players: players.slice(split), rotated: false },
  ];
}

export function LifeCounter() {
  const [game, dispatch] = useLifeCounter();
  const seatOf = new Map(game.players.map((p, i) => [p.id, i]));

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-56px)] max-w-6xl flex-col gap-3 p-3 md:h-[calc(100dvh-3.5rem)] md:p-4">
      <Toolbar game={game} dispatch={dispatch} />
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {boardRows(game).map((row, i) => (
          <div
            key={i}
            className="grid min-h-0 flex-1 gap-2"
            style={{ gridTemplateColumns: `repeat(${row.players.length}, minmax(0, 1fr))` }}
          >
            {row.players.map((player) => (
              <PlayerPanel
                key={player.id}
                game={game}
                player={player}
                seat={seatOf.get(player.id) ?? 0}
                rotated={row.rotated}
                dispatch={dispatch}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
