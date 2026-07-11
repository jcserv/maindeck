import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "@/app/_components/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { listDeckRevisions } from "@/app/_actions/deck/revisions";
import { DeckHistoryList } from "@/app/_components/deck/deck-history-list";

interface DeckHistoryPageProps {
  params: Promise<{ id: string }>;
}

async function DeckHistoryContent({ id }: { id: string }) {
  const [deck, session] = await Promise.all([
    prisma.deck.findUnique({
      where: { id },
      select: { id: true, name: true, userId: true, visibility: true },
    }),
    getSession(),
  ]);
  if (!deck) notFound();

  const isOwner = session?.userId === deck.userId;
  if (deck.visibility === "PRIVATE" && !isOwner) notFound();

  const revisions = await listDeckRevisions(deck.id);

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
          {deck.name} · History
        </h1>
        <p className="text-sm text-muted-foreground">
          Changes to this deck, newest first. Edits by the same player within
          5 minutes are grouped into a single revision.
        </p>
      </div>

      <DeckHistoryList
        deckId={deck.id}
        revisions={revisions}
        isOwner={isOwner}
      />
    </div>
  );
}

export default function DeckHistoryPage({ params }: DeckHistoryPageProps) {
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
        <HistoryLoader params={params} />
      </Suspense>
    </div>
  );
}

async function HistoryLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DeckHistoryContent id={id} />;
}
