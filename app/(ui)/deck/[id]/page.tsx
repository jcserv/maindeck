import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getDeckById } from "@/lib/deck/queries";
import { getTokensForDeck } from "@/lib/deck/token-queries";
import { getSession } from "@/lib/auth/session";
import { DeckHeader } from "@/app/_components/deck-header";
import { DeckBuilder } from "@/app/_components/deck-builder";
import { DeckRouteBridge } from "@/app/_components/header-search-context";
import { DeckActionRow } from "@/app/_components/deck-action-row";
import { DeckDescriptionEditor } from "@/app/_components/deck-description-editor";
import { DeckNameEditor } from "@/app/_components/deck-name-editor";
import { DeckLegalityBadge } from "@/app/_components/deck-legality-badge";
import { DeckBracketBadge } from "@/app/_components/deck-bracket-badge";
import { DeckStats } from "@/app/_components/deck-stats";
import { DrawHand } from "@/app/_components/draw-hand";
import { validateDeck } from "@/lib/deck/legality";
import { resolveDeckBracket } from "@/lib/deck/brackets";

interface DeckPageProps {
  params: Promise<{ id: string }>;
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

async function DeckContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deck, session] = await Promise.all([getDeckById(id), getSession()]);

  if (!deck) notFound();
  const isOwner = session?.userId === deck.userId;

  if (deck.visibility === "PRIVATE" && !isOwner) notFound();

  const { legal, issues } = validateDeck(deck);
  const bracket = resolveDeckBracket(deck);

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

      <DeckBuilder deck={deck} isOwner={isOwner} />

      <Suspense fallback={<div className="h-[240px]" aria-hidden />}>
        <DeckTokens deckId={deck.id} />
      </Suspense>

      <DeckStats deck={deck} />

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Draw a hand
        </h2>
        <DrawHand cards={deck.cards} />
      </section>
    </div>
  );
}

export default function DeckPage({ params }: DeckPageProps) {
  return (
    <div className="px-4 md:px-8 py-6 max-w-[1800px] mx-auto">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <div className="h-8 w-60 rounded-md bg-muted animate-pulse" />
            <div className="h-5 w-40 rounded-md bg-muted animate-pulse" />
          </div>
        }
      >
        <DeckContent params={params} />
      </Suspense>
    </div>
  );
}
