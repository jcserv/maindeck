import Image from "next/image";
import Link from "@/app/_components/link";
import { ColorIdentity } from "@/components/ui/color-identity";
import { Eyebrow } from "@/components/ui/eyebrow";
import { type Format } from "@/lib/generated/prisma/enums";
import { type DeckStripItem } from "@/lib/deck/queries";
import { TimeAgo } from "./time-ago";

export type { DeckStripItem };

function formatLabel(format: Format): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

interface DeckRowProps {
  deck: DeckStripItem;
  priority?: boolean;
}

function DeckRow({ deck, priority = false }: DeckRowProps) {
  return (
    <Link
      href={`/deck/${deck.id}`}
      className="group relative flex flex-col gap-3 min-h-32 bg-card border border-border rounded-sm p-[18px_20px] overflow-hidden hover:bg-accent transition-colors"
    >
      {deck.heroImage && (
        <>
          <Image
            src={deck.heroImage}
            alt=""
            aria-hidden
            fill
            sizes="360px"
            quality={65}
            priority={priority}
            loading={priority ? undefined : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            className="absolute inset-0 object-cover object-[center_18%] opacity-40 scale-[1.6] pointer-events-none"
          />
          <div className="absolute inset-0 bg-linear-to-r from-card via-card/80 to-card/30 pointer-events-none" />
        </>
      )}
      <div className="relative flex items-start justify-between gap-2.5">
        <h3 className="font-display text-[18px] font-medium leading-[1.15] tracking-[-0.01em] line-clamp-2">
          {deck.name}
        </h3>
        <ColorIdentity colors={deck.colors} size="sm" className="mt-0.5 shrink-0" />
      </div>
      <div className="relative mt-auto flex items-center justify-between font-mono text-[11.5px] uppercase tracking-[0.3px] text-muted-foreground">
        <span>
          {formatLabel(deck.format)} · {deck.cardCount} cards
        </span>
        {deck.releasedAt ? (
          <span>Released {new Date(deck.releasedAt).getUTCFullYear()}</span>
        ) : (
          <TimeAgo date={deck.updatedAt} />
        )}
      </div>
    </Link>
  );
}

interface DeckStripProps {
  title: string;
  decks: DeckStripItem[];
  allHref: string;
  allLabel?: string;
  count?: number;
}

export function DeckStrip({
  title,
  decks,
  allHref,
  allLabel = "All decks",
  count,
}: DeckStripProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2.5 mb-5">
        <div className="flex items-baseline gap-2.5">
          <Eyebrow>{title}</Eyebrow>
          {count !== undefined && (
            <span className="font-mono text-xs text-muted-foreground/60">
              {count} decks
            </span>
          )}
        </div>
        <Link
          href={allHref}
          className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
          aria-label={allLabel}
        >
          {allLabel}
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {decks.length === 0 ? (
        <div className="border bg-card rounded-md p-8 text-center text-sm text-muted-foreground">
          No decks yet.{" "}
          <Link href="/deck/new" className="text-primary hover:underline">
            Create your first deck
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
          {decks.map((d, i) => (
            <DeckRow key={d.id} deck={d} priority={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
