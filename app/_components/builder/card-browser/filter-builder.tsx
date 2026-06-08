"use client";

import { useState } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";
import {
  serializeWhere,
  type ParsedWhere,
} from "@/lib/search/syntax-parser";
import { ColorPip } from "./color-pip";

const WUBRG = ["W", "U", "B", "R", "G"] as const;
const TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Planeswalker",
  "Land",
] as const;
const KEYWORDS = [
  "Flying",
  "Trample",
  "Lifelink",
  "Deathtouch",
  "Haste",
  "Draw",
  "Token",
  "Counter",
] as const;

const MV_MAX = 8;

function clone(p: ParsedWhere): ParsedWhere {
  return {
    nameFragments: [...p.nameFragments],
    colors: [...p.colors],
    typeFragments: [...p.typeFragments],
    cmcFilters: p.cmcFilters.map((f) => ({ ...f })),
    oracleFragments: [...p.oracleFragments],
  };
}

function toggle(list: string[], value: string): string[] {
  const i = list.indexOf(value);
  if (i >= 0) return [...list.slice(0, i), ...list.slice(i + 1)];
  return [...list, value];
}

/** Lower (cmc>=) and upper (cmc<=) bounds derived from the parsed filters. */
function manaRange(p: ParsedWhere): { min: number; max: number } {
  let min = 0;
  let max = MV_MAX;
  for (const f of p.cmcFilters) {
    if (f.op === ">=") min = f.value;
    else if (f.op === "<=") max = f.value;
  }
  return { min, max };
}

/** Count of active filter facets — drives the Filters tab badge. */
export function activeFilterCount(p: ParsedWhere): number {
  const { min, max } = manaRange(p);
  return (
    p.colors.length +
    p.typeFragments.length +
    p.oracleFragments.length +
    p.nameFragments.length +
    (min > 0 ? 1 : 0) +
    (max < MV_MAX ? 1 : 0)
  );
}

interface FilterBuilderProps {
  parsed: ParsedWhere;
  onChange: (raw: string) => void;
  small?: boolean;
}

export function FilterBuilder({ parsed, onChange, small }: FilterBuilderProps) {
  function patch(mut: (next: ParsedWhere) => void) {
    const next = clone(parsed);
    mut(next);
    onChange(serializeWhere(next));
  }

  const { min, max } = manaRange(parsed);

  // Local mirror of the name fragment with render-time resync — avoids the
  // set-state-in-effect rule and the controlled-input trailing-space clobber
  // (same pattern as use-card-browser.ts).
  const nameFromParsed = parsed.nameFragments.join(" ");
  const [nameText, setNameText] = useState(nameFromParsed);
  const [prevName, setPrevName] = useState(nameFromParsed);
  if (nameFromParsed !== prevName) {
    // External edit (syntax tab / clear) — pull it back in.
    setPrevName(nameFromParsed);
    setNameText(nameFromParsed);
  }
  function onNameChange(v: string) {
    setNameText(v);
    const trimmed = v.trim();
    setPrevName(trimmed); // keep resync from clobbering keystrokes
    patch((n) => {
      n.nameFragments = trimmed ? [trimmed] : [];
    });
  }

  function setBounds(nextMin: number, nextMax: number) {
    patch((n) => {
      // Drop existing range bounds, keep any other cmc comparisons.
      n.cmcFilters = n.cmcFilters.filter((f) => f.op !== ">=" && f.op !== "<=");
      if (nextMin > 0) n.cmcFilters.push({ op: ">=", value: nextMin });
      if (nextMax < MV_MAX) n.cmcFilters.push({ op: "<=", value: nextMax });
    });
  }

  return (
    <div className="flex flex-col" style={{ gap: small ? 16 : 20 }}>
      {/* Card name */}
      <Section label="Card name">
        <input
          type="text"
          value={nameText}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Lightning Bolt"
          aria-label="Card name"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className={cn(
            "w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-1 focus:ring-ring",
            small ? "h-9" : "h-10",
          )}
        />
      </Section>

      {/* Colors */}
      <Section label="Color identity">
        <div className="flex items-center" style={{ gap: small ? 7 : 9 }}>
          {WUBRG.map((c) => (
            <ColorPip
              key={c}
              color={c}
              active={parsed.colors.includes(c)}
              onClick={() => patch((n) => (n.colors = toggle(n.colors, c)))}
              size={small ? 28 : 30}
            />
          ))}
          {parsed.colors.length > 0 && (
            <button
              type="button"
              onClick={() => patch((n) => (n.colors = []))}
              className="ml-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>
      </Section>

      {/* Mana value */}
      <Section
        label="Mana value"
        right={
          <span className="font-mono text-[11px]">
            {min === 0 && max === MV_MAX
              ? "any"
              : `${min}–${max === MV_MAX ? "8+" : max}`}
          </span>
        }
      >
        <div className="flex flex-col gap-2">
          {(["min", "max"] as const).map((which) => {
            const val = which === "min" ? min : max;
            return (
              <div key={which} className="flex items-center gap-2.5">
                <span className="w-6 font-mono text-[9.5px] uppercase text-muted-foreground">
                  {which}
                </span>
                <input
                  type="range"
                  className="md-range flex-1"
                  min={0}
                  max={MV_MAX}
                  step={1}
                  value={val}
                  aria-label={`Mana value ${which}`}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (which === "min") setBounds(v, Math.max(v, max));
                    else setBounds(Math.min(min, v), v);
                  }}
                />
                <span className="w-4 text-right font-mono text-[11px] tabular-nums">
                  {which === "max" && val === MV_MAX ? "8+" : val}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Card type */}
      <Section label="Card type">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => {
            const v = t.toLowerCase();
            return (
              <FilterChip
                key={t}
                active={parsed.typeFragments.includes(v)}
                onClick={() =>
                  patch((n) => (n.typeFragments = toggle(n.typeFragments, v)))
                }
              >
                {t}
              </FilterChip>
            );
          })}
        </div>
      </Section>

      {/* Keywords */}
      <Section label="Keywords & mechanics">
        <div className="flex flex-wrap gap-1.5">
          {KEYWORDS.map((k) => {
            const v = k.toLowerCase();
            return (
              <FilterChip
                key={k}
                active={parsed.oracleFragments.includes(v)}
                onClick={() =>
                  patch((n) => (n.oracleFragments = toggle(n.oracleFragments, v)))
                }
              >
                {k}
              </FilterChip>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Section({
  label,
  right,
  children,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        {right}
      </div>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-[27px] whitespace-nowrap rounded-md border px-2.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary font-semibold text-primary-foreground"
          : "border-border bg-card font-medium text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
