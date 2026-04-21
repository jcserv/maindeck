import { type getDeckById } from "@/lib/deck/queries";
import {
  computeManaCurve,
  computeColorPips,
  computeTypeBreakdown,
  computeAverageMV,
  expectedLandsInHand,
  countLands,
} from "@/lib/stats/compute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManaCurve } from "@/app/_components/stats/mana-curve";
import { ColorPie } from "@/app/_components/stats/color-pie";
import { TypeBreakdown } from "@/app/_components/stats/type-breakdown";
import { StatSummary } from "@/app/_components/stats/stat-summary";
import { RoleBar } from "@/app/_components/stats/role-bar";
// import { DeckSuggestions } from "@/app/_components/deck-suggestions";

interface DeckStatsProps {
  deck: NonNullable<Awaited<ReturnType<typeof getDeckById>>>;
}

export function DeckStats({ deck }: DeckStatsProps) {
  const cards = deck.cards;
  const manaCurve = computeManaCurve(cards);
  const colorPips = computeColorPips(cards);
  const typeBreakdown = computeTypeBreakdown(cards);
  const avgMV = computeAverageMV(cards);
  const landCount = countLands(cards);
  const expectedLands = expectedLandsInHand(cards);

  return (
    <Card aria-label="Deck health">
      <CardHeader className="flex items-baseline justify-between gap-2">
        <CardTitle>Deck Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <ManaCurve data={manaCurve} />
          <div className="flex flex-col gap-2">
            <RoleBar cards={cards} />
          </div>
          {/* <DeckSuggestions /> */}
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
