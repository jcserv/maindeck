"use client";

import { groupCards, type GroupBy, type GroupSortCard } from "@/lib/deck/group-sort";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

type RoleBarCard = GroupSortCard & { quantity: number };

interface RoleBarProps {
  cards: RoleBarCard[];
  group: GroupBy;
  categoryOrder: string[];
}

const GROUP_LABEL: Record<GroupBy, string> = {
  category: "Categories",
  type: "Types",
  color: "Colors",
  mv: "Mana value",
  set: "Sets",
  rarity: "Rarities",
};

// Palette used for groupings without an inherent color (category, set, mv, rarity).
// Tailwind 70%-opacity tones, ordered for readable adjacency.
const PALETTE = [
  "bg-emerald-500/70",
  "bg-sky-500/70",
  "bg-amber-500/70",
  "bg-rose-500/70",
  "bg-violet-500/70",
  "bg-cyan-500/70",
  "bg-fuchsia-500/70",
  "bg-lime-500/70",
  "bg-orange-500/70",
  "bg-indigo-500/70",
];

const TYPE_COLOR: Record<string, string> = {
  Creature: "bg-amber-500/70",
  Planeswalker: "bg-violet-500/70",
  Battle: "bg-rose-500/70",
  Instant: "bg-sky-500/70",
  Sorcery: "bg-red-500/70",
  Artifact: "bg-stone-400/70",
  Enchantment: "bg-fuchsia-500/70",
  Kindred: "bg-emerald-500/70",
  Land: "bg-stone-400",
};

const COLOR_COLOR: Record<string, string> = {
  W: "bg-amber-200",
  U: "bg-sky-500/80",
  B: "bg-neutral-700",
  R: "bg-red-500/80",
  G: "bg-emerald-600/80",
  Colorless: "bg-stone-400",
  Multicolor: "bg-yellow-400",
  Land: "bg-stone-400",
};

const RARITY_COLOR: Record<string, string> = {
  common: "bg-stone-500",
  uncommon: "bg-slate-300",
  rare: "bg-amber-400",
  mythic: "bg-orange-500",
};

function segmentColor(group: GroupBy, key: string, index: number): string {
  if (group === "type") return TYPE_COLOR[key] ?? PALETTE[index % PALETTE.length]!;
  if (group === "color")
    return COLOR_COLOR[key] ?? PALETTE[index % PALETTE.length]!;
  if (group === "rarity")
    return RARITY_COLOR[key] ?? PALETTE[index % PALETTE.length]!;
  return PALETTE[index % PALETTE.length]!;
}

export function RoleBar({ cards, group, categoryOrder }: RoleBarProps) {
  const sections = groupCards(cards, group, categoryOrder).filter(
    (s) => s.cards.length > 0,
  );

  const counts = sections.map((s) => ({
    key: s.key,
    label: s.label,
    count: s.cards.reduce((sum, dc) => sum + dc.quantity, 0),
  }));
  const total = counts.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Eyebrow>{GROUP_LABEL[group]}</Eyebrow>
        <p className="text-xs text-muted-foreground">
          Add cards to see distribution.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>{GROUP_LABEL[group]}</Eyebrow>
      <div
        className="flex h-2 w-full rounded-full overflow-hidden bg-muted"
        role="img"
        aria-label={`Distribution by ${GROUP_LABEL[group].toLowerCase()}`}
      >
        {counts.map((s, i) => (
          <div
            key={s.key}
            className={segmentColor(group, s.key, i)}
            style={{ width: `${(s.count / total) * 100}%` }}
            aria-label={`${s.label}: ${s.count}`}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {counts.map((s, i) => {
          const pct = Math.round((s.count / total) * 100);
          return (
            <li key={s.key} className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "inline-block size-2 rounded-sm shrink-0",
                  segmentColor(group, s.key, i),
                )}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground truncate" title={s.label}>
                {s.label}
              </span>
              <span className="tabular-nums text-foreground shrink-0">
                {s.count}
                <span className="text-muted-foreground"> · {pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
