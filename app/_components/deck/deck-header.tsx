import type { ReactNode } from "react";
import { Globe, Link2, Lock } from "lucide-react";
import { DeckVisibilityPicker } from "@/app/_components/deck/deck-visibility-picker";
import { computeDeckPrice } from "@/lib/deck/price";
import {
  computeAverageMV,
  countLands,
  expectedLandsInHand,
  formatTargets,
} from "@/lib/stats/compute";
import type { getDeckById } from "@/lib/deck/queries";
import type {
  Format,
  Visibility,
} from "@/lib/generated/prisma/enums";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Link } from "@/app/_components/link";

type Deck = NonNullable<Awaited<ReturnType<typeof getDeckById>>>;

interface DeckHeaderProps {
  deck: Deck;
  ownerEmail?: string | null;
  isOwner?: boolean;
  actions?: ReactNode;
  nameSlot?: ReactNode;
  descriptionSlot?: ReactNode;
}

function formatLabel(format: Format): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

function VisibilityInline({ visibility }: { visibility: Visibility }) {
  const { Icon, label } =
    visibility === "PRIVATE"
      ? { Icon: Lock, label: "Private" }
      : visibility === "UNLISTED"
        ? { Icon: Link2, label: "Unlisted" }
        : { Icon: Globe, label: "Public" };
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function StatCell({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2.5 min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className="text-lg font-semibold tabular-nums leading-tight truncate">
        {value}
      </div>
      {sublabel && (
        <div className="text-[11px] text-muted-foreground truncate">
          {sublabel}
        </div>
      )}
    </div>
  );
}

type DeckHeaderStats = {
  commanderCard: DeckHeaderProps["deck"]["cards"][number] | undefined;
  cardsValue: string | number;
  cardsSublabel: string | undefined;
  avgMV: number;
  landCount: number;
  landsSublabel: string | undefined;
  usd: number;
  t1Lands: number;
};

function countByZone(
  cards: DeckHeaderProps["deck"]["cards"],
  predicate: (zone: string) => boolean,
): number {
  return cards.reduce((s, c) => (predicate(c.zone) ? s + c.quantity : s), 0);
}

function computeDeckHeaderStats(deck: DeckHeaderProps["deck"]): DeckHeaderStats {
  const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
  const mainboardAndCommanderCount = countByZone(
    deck.cards,
    (z) => z === "MAINBOARD" || z === "COMMANDER",
  );
  const sideboardCount = countByZone(deck.cards, (z) => z === "SIDEBOARD");
  const consideringCount = countByZone(deck.cards, (z) => z === "CONSIDERING");
  const targets = formatTargets(deck.format);

  const cardsValue = targets.requiredCards
    ? `${mainboardAndCommanderCount} / ${targets.requiredCards}`
    : mainboardAndCommanderCount;

  const cardsSublabelParts: string[] = [];
  if (sideboardCount > 0) cardsSublabelParts.push(`${sideboardCount} sideboard`);
  if (consideringCount > 0) cardsSublabelParts.push(`${consideringCount} considering`);
  const cardsSublabel =
    cardsSublabelParts.length > 0 ? cardsSublabelParts.join(" · ") : undefined;

  const landCount = countLands(deck.cards);
  const landsSublabel = targets.targetLands
    ? `target ${targets.targetLands}`
    : totalCards > 0
      ? `${Math.round((landCount / totalCards) * 100)}% of deck`
      : undefined;

  return {
    commanderCard: deck.cards.find((dc) => dc.zone === "COMMANDER"),
    cardsValue,
    cardsSublabel,
    avgMV: computeAverageMV(deck.cards),
    landCount,
    landsSublabel,
    usd: computeDeckPrice(deck.cards).usd,
    t1Lands: expectedLandsInHand(deck.cards, 7),
  };
}

export function DeckHeader({
  deck,
  isOwner = false,
  actions,
  nameSlot,
  descriptionSlot,
}: DeckHeaderProps) {
  const {
    commanderCard,
    cardsValue,
    cardsSublabel,
    avgMV,
    landCount,
    landsSublabel,
    usd,
    t1Lands,
  } = computeDeckHeaderStats(deck);

  return (
    <header className="flex flex-col gap-4">
      {/* Eyebrow row */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Eyebrow className="shrink-0">{formatLabel(deck.format)}</Eyebrow>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          {isOwner ? (
            <DeckVisibilityPicker
              deckId={deck.id}
              visibility={deck.visibility}
            />
          ) : (
            <span className="inline-flex items-center gap-1">
              <VisibilityInline visibility={deck.visibility} />
            </span>
          )}
          {deck.user?.username && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/u/${deck.user.username}`}
                className="text-muted-foreground/80 hover:underline"
              >
                {deck.user.username}
              </Link>
            </>
          )}
        </span>
        {commanderCard && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">
              <span className="text-muted-foreground/80">led by </span>
              <span className="text-foreground font-medium">
                {commanderCard.card.name}
              </span>
            </span>
          </>
        )}
      </div>

      {/* Title + actions */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 md:flex-1">
          {nameSlot !== undefined ? (
            nameSlot
          ) : (
            <h1 className="font-heading text-3xl md:text-4xl font-semibold leading-tight tracking-tight truncate min-w-0">
              {deck.name}
            </h1>
          )}
          {descriptionSlot !== undefined ? (
            descriptionSlot
          ) : deck.description ? (
            <p className="mt-2 text-sm text-muted-foreground max-w-prose leading-relaxed">
              {deck.description}
            </p>
          ) : null}
        </div>
        {actions && <div className="md:shrink-0">{actions}</div>}
      </div>

      {/* Stats strip */}
      <div
        className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x border-y bg-muted/30"
        aria-label="Deck statistics"
      >
        <StatCell label="Cards" value={cardsValue} {...(cardsSublabel !== undefined && { sublabel: cardsSublabel })} />
        <StatCell
          label="Avg MV"
          value={avgMV > 0 ? avgMV.toFixed(2) : "—"}
          sublabel="mainboard, non-land"
        />
        <StatCell label="Lands" value={landCount} {...(landsSublabel !== undefined && { sublabel: landsSublabel })} />
        <StatCell
          label="Value"
          value={usd > 0 ? `$${usd.toFixed(0)}` : "—"}
          sublabel="USD"
        />
        <StatCell
          label="T1 Lands"
          value={t1Lands > 0 ? t1Lands.toFixed(2) : "—"}
          sublabel="expected in opener"
        />
      </div>
    </header>
  );
}

