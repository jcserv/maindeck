import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDeckById } from "@/lib/deck/queries";
import { getSession } from "@/lib/auth/session";
import { PlaytestLoader } from "./playtest-loader";

interface PlayPageProps {
  params: Promise<{ id: string }>;
}

export default function PlayPage({ params }: PlayPageProps) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-background" />}>
      <PlayPageContent params={params} />
    </Suspense>
  );
}

async function PlayPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deck, session] = await Promise.all([getDeckById(id), getSession()]);

  if (!deck) notFound();

  const isOwner = session?.userId === deck.userId;
  if (deck.visibility === "PRIVATE" && !isOwner) notFound();

  return (
    <PlaytestLoader
      deckId={deck.id}
      deckName={deck.name}
      format={deck.format}
      cards={deck.cards.map((dc) => ({
        id: dc.id,
        quantity: dc.quantity,
        zone: dc.zone,
        category: dc.category,
        card: {
          id: String(dc.card.id),
          name: dc.card.name,
          manaCost: dc.card.manaCost,
          cmc: dc.card.cmc,
          typeLine: dc.card.typeLine,
          gameChanger: dc.card.gameChanger,
          printings: dc.card.printings,
        },
        printing: dc.printing ? { imageUri: dc.printing.imageUri } : null,
      }))}
    />
  );
}
