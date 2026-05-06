import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  getDeckById,
  getForkAncestry,
  hasViewerLikedDeck,
} from "@/lib/deck/queries";
import { getTokensForDeck } from "@/lib/deck/token-queries";
import { isDeckSavedByUser } from "@/lib/deck/saved-queries";
import { getSession } from "@/lib/auth/session";
import {
  NOT_FOUND_METADATA,
  buildDeckJsonLd,
  buildDeckMetadata,
} from "@/lib/deck/metadata";
import { DeckHeader } from "@/app/_components/deck/deck-header";
import { DeckBuilder } from "@/app/_components/builder/deck-builder";
import { DeckRouteBridge } from "@/app/_components/header-search/header-search-context";
import { DeckActionRow } from "@/app/_components/deck/deck-action-row";
import { DeckDescriptionEditor } from "@/app/_components/deck/deck-description-editor";
import { DeckNameEditor } from "@/app/_components/deck/deck-name-editor";
import { DeckLegalityBadge } from "@/app/_components/deck/deck-legality-badge";
import { DeckBracketBadge } from "@/app/_components/deck/deck-bracket-badge";
import { DeckStats } from "@/app/_components/stats/deck-stats";
import { DrawHand } from "@/app/_components/deck/draw-hand";
import { UpgradePreconButton } from "@/app/_components/deck/upgrade-precon-button";
import { ForkBreadcrumb } from "@/app/_components/deck/fork-breadcrumb";
import { ForkDescendants } from "@/app/_components/deck/fork-descendants";
import { validateDeck } from "@/lib/deck/legality";
import { resolveDeckBracket } from "@/lib/deck/brackets";

interface DeckPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upgrade?: string; forks?: string }>;
}

export async function generateMetadata({
  params,
}: DeckPageProps): Promise<Metadata> {
  const { id } = await params;
  const [deck, session] = await Promise.all([getDeckById(id), getSession()]);
  // Don't leak deck name in <title> for PRIVATE decks the visitor can't see.
  if (deck && deck.visibility === "PRIVATE" && session?.userId !== deck.userId) {
    return NOT_FOUND_METADATA;
  }
  return buildDeckMetadata(deck);
}

async function DeckJsonLd({ deckId }: { deckId: string }) {
  const deck = await getDeckById(deckId);
  const ld = buildDeckJsonLd(deck);
  if (!ld) return null;
  return (
    <script
      type="application/ld+json"
      // JSON.stringify produces only well-formed JSON; no XSS surface here.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

function parseForksPage(value: string | undefined): number {
  if (!value) return 1;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function ForkBreadcrumbAsync({ deckId }: { deckId: string }) {
  const ancestors = await getForkAncestry(deckId);
  return <ForkBreadcrumb ancestors={ancestors} />;
}

async function DeckTokens({ deckId }: { deckId: string }) {
  const tokens = await getTokensForDeck(deckId);
  if (tokens.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Tokens
      </h2>
      <ul
        className="flex flex-wrap gap-4"
        aria-label={`${tokens.length} token${tokens.length !== 1 ? "s" : ""} produced by this deck`}
      >
        {tokens.map((token) => (
          <li
            key={token.tokenScryfallId}
            className="flex flex-col gap-1.5 w-28 sm:w-32 md:w-36 shrink-0"
          >
            <div className="relative aspect-[63/88] w-full rounded-md bg-muted overflow-hidden">
              <Image
                src={token.tokenImageUri}
                alt={token.tokenName}
                fill
                sizes="(min-width: 768px) 144px, (min-width: 640px) 128px, 112px"
                quality={65}
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium leading-tight line-clamp-2">
                {token.tokenName}
              </span>
              <span className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
                by {token.producedBy.join(", ")}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function DeckContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upgrade?: string; forks?: string }>;
}) {
  const [{ id }, { upgrade, forks }] = await Promise.all([params, searchParams]);
  const forksPage = parseForksPage(forks);
  const [deck, session] = await Promise.all([getDeckById(id), getSession()]);

  if (!deck) notFound();
  const isOwner = session?.userId === deck.userId;

  if (deck.visibility === "PRIVATE" && !isOwner) notFound();

  const initialSaved = session
    ? await isDeckSavedByUser({ userId: session.userId, deckId: deck.id })
    : false;

  const { legal, issues } = validateDeck(deck);
  const bracket = resolveDeckBracket(deck);
  const isUpgradablePrecon =
    deck.externalSource === "mtgjson" && deck.visibility === "PUBLIC";
  const autoRunUpgrade = upgrade === "1";

  const canLike = session !== null && deck.visibility === "PUBLIC";
  const viewerLiked = canLike
    ? await hasViewerLikedDeck(deck.id, session?.userId)
    : false;

  return (
    <div className="flex flex-col gap-8">
      <DeckRouteBridge deckId={deck.id} isOwner={isOwner} />
      <DeckHeader
        deck={deck}
        isOwner={isOwner}
        actions={
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <DeckLegalityBadge legal={legal} issues={issues} />
            {bracket && (
              <DeckBracketBadge
                deckId={deck.id}
                resolved={bracket}
                isOwner={isOwner}
              />
            )}
            <DeckActionRow
              deckId={deck.id}
              deckName={deck.name}
              isOwner={isOwner}
              isPrivate={deck.visibility === "PRIVATE"}
              viewerLoggedIn={session !== null}
              initialSaved={initialSaved}
              {...(canLike && {
                like: { likeCount: deck.likeCount, liked: viewerLiked },
              })}
            />
          </div>
        }
        nameSlot={
          <DeckNameEditor
            deckId={deck.id}
            name={deck.name}
            isOwner={isOwner}
          />
        }
        descriptionSlot={
          <DeckDescriptionEditor
            deckId={deck.id}
            description={deck.description}
            isOwner={isOwner}
          />
        }
      />

      <Suspense fallback={<div className="h-[20px]" aria-hidden />}>
        <ForkBreadcrumbAsync deckId={deck.id} />
      </Suspense>

      {isUpgradablePrecon && (
        <UpgradePreconButton
          deckId={deck.id}
          isLoggedIn={session !== null}
          autoRun={autoRunUpgrade}
        />
      )}

      <DeckBuilder deck={deck} isOwner={isOwner} />

      <Suspense fallback={<div className="h-[240px]" aria-hidden />}>
        <DeckTokens deckId={deck.id} />
      </Suspense>

      <DeckStats deck={deck} />

      <Suspense fallback={<div className="h-[40px]" aria-hidden />}>
        <ForkDescendants deckId={deck.id} page={forksPage} />
      </Suspense>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Draw a hand
        </h2>
        <DrawHand cards={deck.cards} />
      </section>
    </div>
  );
}

async function DeckJsonLdResolver({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DeckJsonLd deckId={id} />;
}

export default function DeckPage({ params, searchParams }: DeckPageProps) {
  return (
    <div className="px-4 md:px-8 py-6 max-w-[1800px] mx-auto">
      <Suspense fallback={null}>
        <DeckJsonLdResolver params={params} />
      </Suspense>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <div className="h-8 w-60 rounded-md bg-muted animate-pulse" />
            <div className="h-5 w-40 rounded-md bg-muted animate-pulse" />
          </div>
        }
      >
        <DeckContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
