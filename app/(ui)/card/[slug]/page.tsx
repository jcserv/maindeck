import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Chip } from "@/components/ui/chip";
import { ColorIdentity } from "@/components/ui/color-identity";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { OracleText } from "@/app/_components/card/oracle-text";
import Link from "@/app/_components/link";
import { PrintingCarousel } from "@/app/_components/builder/printing-carousel";
import { getPrintingsForCard } from "@/lib/card/printing-queries";
import { getCardBySlug, getDecksContainingCard } from "@/lib/card/queries";
import { getSession } from "@/lib/auth/session";

interface CardPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}

function resolveBackLink(from: string | undefined): { href: string; label: string } {
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    if (from.startsWith("/deck/")) return { href: from, label: "Back to deck" };
    if (from.startsWith("/search")) return { href: from, label: "Back to search" };
    if (from.startsWith("/decks")) return { href: from, label: "Back to decks" };
  }
  return { href: "/search", label: "Back to search" };
}

// ── "Appears in my decks" section ─────────────────────────────────────────────

async function AppearsIn({ cardId }: { cardId: number }) {
  const session = await getSession();
  if (!session) return null;

  const decks = await getDecksContainingCard(session.userId, cardId);
  if (decks.length === 0) return null;

  return (
    <section className="mt-8">
      <Eyebrow className="mb-3">Appears in my decks</Eyebrow>
      <div className="rounded border border-border divide-y divide-border">
        {decks.map((deck) => (
          <Link
            key={deck.id}
            href={`/deck/${deck.id}`}
            className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted transition-colors"
          >
            <span className="text-sm font-medium">{deck.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {deck.format ?? "—"} · {deck.copies} cop{deck.copies === 1 ? "y" : "ies"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Page content ──────────────────────────────────────────────────────────────

async function CardContent({ slug, from }: { slug: string; from: string | undefined }) {
  const card = await getCardBySlug(slug);
  if (!card) notFound();

  const printings = await getPrintingsForCard(card.id);
  const back = resolveBackLink(from);

  const metaItems = [
    { label: "Set", value: card.setCode ?? "—" },
    { label: "Collector №", value: card.collectorNumber ?? "—" },
    { label: "CMC", value: card.cmc != null ? String(card.cmc) : "—" },
    { label: "EDHREC rank", value: "—" },
  ];

  return (
    <div>
      {/* Back link */}
      <Link
        href={back.href}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        {back.label}
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-10 md:gap-14">
        {/* Card image + printings browser */}
        <div>
          <PrintingCarousel printings={printings} />

          {/* Add to deck — stub */}
          <div className="mt-3">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="w-full h-9 rounded-md bg-primary/50 text-primary-foreground text-sm font-medium cursor-not-allowed opacity-60"
            >
              Add to deck
            </button>
          </div>
        </div>

        {/* Card info */}
        <div className="min-w-0">
          <Eyebrow className="mb-3">
            {card.mainType}
            {card.setCode && ` · ${card.setCode.toUpperCase()}`}
          </Eyebrow>

          <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-none mb-3">
            {card.name}
          </h1>

          {/* Mana cost + type line */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {card.manaCost && (
              <ManaCost cost={card.manaCost} size="md" />
            )}
            <ColorIdentity colors={card.colors} size="md" />
            {card.typeLine && (
              <span className="text-sm text-muted-foreground">{card.typeLine}</span>
            )}
            {card.gameChanger && (
              <Chip tone="accent" size="md" title="Commander Game Changer">
                Game Changer
              </Chip>
            )}
          </div>

          {/* Oracle text */}
          {card.oracleText && (
            <div className="border-t border-b border-border py-5 mb-7">
              <OracleText text={card.oracleText} />
            </div>
          )}

          {/* Metadata strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {metaItems.map(({ label, value }) => (
              <div key={label}>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
                  {label}
                </div>
                <div className="font-mono text-[15px] font-medium">{value}</div>
              </div>
            ))}
          </div>

          {/* Set name badge */}
          {card.setName && (
            <div className="mb-6">
              <Chip tone="neutral" size="md">{card.setName}</Chip>
            </div>
          )}

          {/* Appears in my decks */}
          <Suspense fallback={<div className="h-[20px]" aria-hidden />}>
            <AppearsIn cardId={card.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function CardPage({ params, searchParams }: CardPageProps) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <Suspense
        fallback={
          <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-10 md:gap-14">
            <div className="aspect-[380/530] rounded-xl bg-muted animate-pulse" />
            <div className="flex flex-col gap-4 pt-4">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-10 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-5 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          </div>
        }
      >
        <CardContentWrapper params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CardContentWrapper({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  // Runtime boundary — keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const [{ slug }, { from }] = await Promise.all([params, searchParams]);
  return <CardContent slug={slug} from={from} />;
}
