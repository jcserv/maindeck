import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft, PencilLine } from "lucide-react";
import Link from "@/app/_components/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canCollaborateOnDeck } from "@/lib/auth/deck-access";
import { listDeckProposals } from "@/app/_actions/deck/collaboration";
import { DeckProposalReviewList } from "@/app/_components/deck/deck-proposal-review-list";

interface DeckCollaboratePageProps {
  params: Promise<{ id: string }>;
}

async function DeckCollaborateContent({ id }: { id: string }) {
  const [deck, session] = await Promise.all([
    prisma.deck.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        userId: true,
        collaborationEnabled: true,
      },
    }),
    getSession(),
  ]);
  if (!deck) notFound();

  const isOwner = session?.userId === deck.userId;
  const isCollaborator =
    !isOwner && (await canCollaborateOnDeck(deck, session?.userId));
  if (!isOwner && !isCollaborator) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/deck/${deck.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back to deck
        </Link>
        <h1 className="font-heading text-2xl md:text-3xl font-semibold leading-tight tracking-tight">
          {deck.name} · Collaborate
        </h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Review proposed changes from people you follow. Approving applies the whole proposal at once."
            : "Propose card changes for the owner to review. They can approve or reject the whole proposal."}
        </p>
      </div>

      {isOwner ? (
        <DeckOwnerReview deckId={deck.id} />
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-md border border-dashed p-6">
          <p className="text-sm text-muted-foreground max-w-prose">
            Build a set of add/remove/quantity changes, then submit it for the
            owner to approve or reject.
          </p>
          <Button render={<Link href={`/deck/${deck.id}/propose`} />}>
            <PencilLine className="size-3.5" aria-hidden />
            Propose changes
          </Button>
        </div>
      )}
    </div>
  );
}

async function DeckOwnerReview({ deckId }: { deckId: string }) {
  const proposals = await listDeckProposals(deckId);
  return <DeckProposalReviewList deckId={deckId} proposals={proposals} />;
}

export default function DeckCollaboratePage({
  params,
}: DeckCollaboratePageProps) {
  return (
    <div className="px-4 md:px-8 py-6 max-w-[1000px] mx-auto">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <div className="h-6 w-40 rounded-md bg-muted animate-pulse" />
            <div className="h-[120px] rounded-md bg-muted/30 animate-pulse" />
          </div>
        }
      >
        <CollaborateLoader params={params} />
      </Suspense>
    </div>
  );
}

async function CollaborateLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DeckCollaborateContent id={id} />;
}
