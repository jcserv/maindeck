"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { type CardType } from "@/lib/generated/prisma/enums";
import { type getDeckById } from "@/lib/deck/queries";
import {
  computeAverageMV,
  computeColorPips,
  computeManaCurve,
  computeTypeBreakdown,
  countLands,
  expectedLandsInHand,
  filterByTypes,
} from "@/lib/stats/compute";
import { getCardTypeMeta } from "@/lib/card/types-meta";
import { type GroupBy } from "@/lib/deck/group-sort";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ManaCurve } from "@/app/_components/stats/mana-curve";
import { ColorPie } from "@/app/_components/stats/color-pie";
import { TypeBreakdown } from "@/app/_components/stats/type-breakdown";
import { StatSummary } from "@/app/_components/stats/stat-summary";
import { RoleBar } from "@/app/_components/stats/role-bar";

// Card types worth slicing the curve by. Lands are omitted — the mana curve
// excludes them anyway — leaving the spell/permanent types a curve speaks to.
const FILTER_TYPES = [
  "Creature",
  "Artifact",
  "Enchantment",
  "Instant",
  "Sorcery",
  "Planeswalker",
] as const satisfies readonly CardType[];

const GROUP_VALUES: readonly GroupBy[] = [
  "category",
  "type",
  "color",
  "mv",
  "set",
  "rarity",
];

function parseGroup(raw: string | null): GroupBy {
  return GROUP_VALUES.includes(raw as GroupBy) ? (raw as GroupBy) : "category";
}

interface DeckStatsProps {
  deck: NonNullable<Awaited<ReturnType<typeof getDeckById>>>;
}

export function DeckStats({ deck }: DeckStatsProps) {
  const searchParams = useSearchParams();
  const rawGroup = searchParams.get("group");
  const group = parseGroup(rawGroup);
  const isOwnershipGroup = rawGroup === "ownership";

  const [selectedTypes, setSelectedTypes] = useState<CardType[]>([]);
  function toggleType(type: CardType) {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type],
    );
  }

  const cards = filterByTypes(deck.cards, selectedTypes);
  const manaCurve = computeManaCurve(cards);
  const colorPips = computeColorPips(cards);
  const typeBreakdown = computeTypeBreakdown(cards);
  const avgMV = computeAverageMV(cards);
  const landCount = countLands(deck.cards);
  const expectedLands = expectedLandsInHand(deck.cards);

  const categoryOrder = deck.categories.map((c) => c.name);

  return (
    <Card aria-label="Deck health">
      <CardHeader className="flex items-baseline justify-between gap-2">
        <CardTitle>Deck Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div aria-label="Filter deck health by card type">
          <div className="mb-2 flex items-center justify-between">
            <Eyebrow>Filter by type</Eyebrow>
            {selectedTypes.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTypes([])}
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_TYPES.map((type) => {
              const meta = getCardTypeMeta(type);
              const active = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  aria-pressed={active}
                  className={cn(
                    "h-[27px] whitespace-nowrap rounded-md border px-2.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary font-semibold text-primary-foreground"
                      : "border-border bg-card font-medium text-foreground hover:bg-muted",
                  )}
                >
                  {meta.emoji} {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <ManaCurve data={manaCurve} />
          <div className="flex flex-col gap-2">
            {isOwnershipGroup ? (
              <p className="text-xs text-muted-foreground">
                Grouped by ownership in the list.
              </p>
            ) : (
              <RoleBar
                cards={cards}
                group={group}
                categoryOrder={categoryOrder}
              />
            )}
          </div>
        </div>

        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors select-none">
            More stats
          </summary>
          <div className="mt-4 flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
              <TypeBreakdown data={typeBreakdown} />
              <ColorPie data={colorPips} />
            </div>
            <StatSummary
              avgMV={avgMV}
              landCount={landCount}
              expectedLands={expectedLands}
            />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
