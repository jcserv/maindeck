"use client";

import { ArrowRight } from "lucide-react";
import Link from "@/app/_components/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DeckComparisonResult,
  DeckStatBlock,
} from "@/lib/deck/compare";

const WUBRG = ["W", "U", "B", "R", "G", "C"] as const;
const COLOR_LABEL: Record<(typeof WUBRG)[number], string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

function DeckHeading({
  meta,
  align,
}: {
  meta: DeckComparisonResult["a"];
  align: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {meta.format}
      </p>
      <Link
        href={meta.url ?? `/deck/${meta.id}`}
        className="text-lg font-medium hover:underline break-words"
      >
        {meta.name}
      </Link>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background px-4 py-3">
      <p className="text-2xl font-medium tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function StatRow({
  label,
  a,
  b,
}: {
  label: string;
  a: number;
  b: number;
}) {
  const delta = b - a;
  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-3 text-right tabular-nums">{num(a)}</td>
      <td className="py-1.5 px-3 text-center text-xs text-muted-foreground">
        {label}
      </td>
      <td className="py-1.5 pl-3 text-left tabular-nums">{num(b)}</td>
      <td className="py-1.5 pl-3 text-right tabular-nums text-xs text-muted-foreground">
        {delta === 0 ? "—" : delta > 0 ? `+${num(delta)}` : num(delta)}
      </td>
    </tr>
  );
}

const MANA_CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"] as const;

function SectionRow({ label }: { label: string }) {
  return (
    <tr className="border-t border-border">
      <td
        colSpan={4}
        className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </td>
    </tr>
  );
}

function StatComparison({ a, b }: { a: DeckStatBlock; b: DeckStatBlock }) {
  const typeLabels = Array.from(
    new Set([...Object.keys(a.typeBreakdown), ...Object.keys(b.typeBreakdown)]),
  ).sort();

  return (
    <table className="w-full text-sm">
      <tbody>
        <StatRow label="Cards" a={a.cardCount} b={b.cardCount} />
        <StatRow label="Avg. MV" a={a.avgMV} b={b.avgMV} />
        <StatRow label="Lands" a={a.landCount} b={b.landCount} />
        <StatRow
          label="Exp. lands (7)"
          a={a.expectedLands}
          b={b.expectedLands}
        />

        <SectionRow label="Color pips" />
        {WUBRG.map((c) => (
          <StatRow
            key={c}
            label={COLOR_LABEL[c]}
            a={a.colorPips[c]}
            b={b.colorPips[c]}
          />
        ))}

        <SectionRow label="Mana curve" />
        {MANA_CURVE_BUCKETS.map((mv) => (
          <StatRow
            key={mv}
            label={mv}
            a={a.manaCurve[mv] ?? 0}
            b={b.manaCurve[mv] ?? 0}
          />
        ))}

        {typeLabels.length > 0 && <SectionRow label="Type breakdown" />}
        {typeLabels.map((t) => (
          <StatRow
            key={t}
            label={t}
            a={a.typeBreakdown[t] ?? 0}
            b={b.typeBreakdown[t] ?? 0}
          />
        ))}
      </tbody>
    </table>
  );
}

function CardColumn({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <span className={`inline-block size-2 rounded-full ${accent}`} aria-hidden />
        {title}
        <span className="text-muted-foreground font-normal tabular-nums">
          ({count})
        </span>
      </h3>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">{children}</ul>
      )}
    </div>
  );
}

export function DeckComparison({ result }: { result: DeckComparisonResult }) {
  const { a, b, cards, stats } = result;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <DeckHeading meta={a} align="left" />
        <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
        <DeckHeading meta={b} align="right" />
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border"
        aria-label="Comparison summary"
      >
        <SummaryTile label={`Only in ${a.name}`} value={cards.summary.removedCards} />
        <SummaryTile label="Shared" value={cards.summary.sharedCards} />
        <SummaryTile label={`Only in ${b.name}`} value={cards.summary.addedCards} />
        <SummaryTile label="Qty changed" value={cards.summary.changedCards} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <StatComparison a={stats.a} b={stats.b} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <CardColumn
              title={`Only in ${a.name}`}
              count={cards.removed.length}
              accent="bg-red-500"
            >
              {cards.removed.map((c) => (
                <li key={c.cardId} className="flex justify-between gap-2">
                  <span className="break-words">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {c.quantity}
                  </span>
                </li>
              ))}
            </CardColumn>

            <CardColumn
              title="Shared"
              count={cards.shared.length}
              accent="bg-muted-foreground"
            >
              {cards.shared.map((c) => (
                <li key={c.cardId} className="flex justify-between gap-2">
                  <span className="break-words">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {c.delta === 0
                      ? c.aQuantity
                      : `${c.aQuantity} → ${c.bQuantity}`}
                  </span>
                </li>
              ))}
            </CardColumn>

            <CardColumn
              title={`Only in ${b.name}`}
              count={cards.added.length}
              accent="bg-green-500"
            >
              {cards.added.map((c) => (
                <li key={c.cardId} className="flex justify-between gap-2">
                  <span className="break-words">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {c.quantity}
                  </span>
                </li>
              ))}
            </CardColumn>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
