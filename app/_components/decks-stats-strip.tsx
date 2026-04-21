import { Eyebrow } from "@/components/ui/eyebrow";
import type { Format } from "@/lib/generated/prisma/enums";

interface DeckStat {
  id: string;
  format: Format;
  cardCount: number;
}

interface DecksStatsStripProps {
  decks: DeckStat[];
}

export function DecksStatsStrip({ decks }: DecksStatsStripProps) {
  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum, d) => sum + d.cardCount, 0);
  const avgCards =
    totalDecks > 0 ? Math.round(totalCards / totalDecks) : 0;
  const formats = [...new Set(decks.map((d) => d.format))];
  const formatsLabel =
    formats.length === 0
      ? "—"
      : formats.length <= 3
        ? formats
            .map((f) => f.charAt(0) + f.slice(1).toLowerCase())
            .join(", ")
        : `${formats.length} formats`;

  const stats = [
    {
      label: "Total decks",
      value: totalDecks,
      sub: `${totalDecks} deck${totalDecks !== 1 ? "s" : ""}`,
    },
    {
      label: "Cards tracked",
      value: totalCards,
      sub: `across ${totalDecks} deck${totalDecks !== 1 ? "s" : ""}`,
    },
    {
      label: "Avg size",
      value: avgCards,
      sub: "cards per deck",
    },
    {
      label: "Formats",
      value: formats.length,
      sub: formatsLabel,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-8">
      {stats.map((s) => (
        <div key={s.label} className="bg-background px-5 py-[18px]">
          <Eyebrow className="mb-2">{s.label}</Eyebrow>
          <div className="text-[30px] font-medium leading-none tabular-nums">
            {s.value}
          </div>
          {s.sub && (
            <div className="text-[11.5px] text-muted-foreground mt-1.5">
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
