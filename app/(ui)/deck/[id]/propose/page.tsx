import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "@/app/_components/link";
import { requireDeckCollaborator } from "@/lib/auth/deck-access";
import { getDeckById } from "@/lib/deck/queries";
import { DeckProposeDraft } from "@/app/_components/deck/deck-propose-draft";

interface DeckProposePageProps {
  params: Promise<{ id: string }>;
}

async function DeckProposeContent({ id }: { id: string }) {
  await requireDeckCollaborator(id);
  const deck = await getDeckById(id);
  if (!deck) notFound();

  const mainboard = deck.cards
    .filter((c) => c.zone === "MAINBOARD")
    .map((c) => ({
      cardId: c.cardId,
      cardName: c.card.name,
      category: c.category,
      quantity: c.quantity,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/deck/${id}/collaborate`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back to collaborate
        </Link>
        <h1 className="font-heading text-2xl md:text-3xl font-semibold leading-tight tracking-tight">
          Propose changes to {deck.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Adjust mainboard quantities or add new cards, then submit for the
          owner to review.
        </p>
      </div>

      <DeckProposeDraft deckId={id} existingCards={mainboard} />
    </div>
  );
}

export default function DeckProposePage({ params }: DeckProposePageProps) {
  return (
    <div className="px-4 md:px-8 py-6 max-w-[900px] mx-auto">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <div className="h-6 w-40 rounded-md bg-muted animate-pulse" />
            <div className="h-[240px] rounded-md bg-muted/30 animate-pulse" />
          </div>
        }
      >
        <ProposeLoader params={params} />
      </Suspense>
    </div>
  );
}

async function ProposeLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DeckProposeContent id={id} />;
}
