import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/ui/eyebrow";
import { getSession } from "@/lib/auth/session";
import { getDeckById, getDecksByUserMinimal } from "@/lib/deck/queries";
import { NOT_FOUND_METADATA } from "@/lib/deck/metadata";
import { getViewerHoldingsForDeck } from "@/lib/inventory/queries";
import { DeckBuilder } from "@/app/_components/builder/deck-builder";
import { DeckRouteBridge } from "@/app/_components/header-search/header-search-context";
import { DeckVisibilityPicker } from "@/app/_components/deck/deck-visibility-picker";
import { DeckNameEditor } from "@/app/_components/deck/deck-name-editor";
import { DeckDescriptionEditor } from "@/app/_components/deck/deck-description-editor";
import { DeletePackageButton } from "@/app/_components/package/delete-package-button";
import { ApplyToDeckDialog } from "@/app/_components/package/apply-to-deck-dialog";
import Link from "@/app/_components/link";

interface PackagePageProps {
  params: Promise<{ id: string }>;
}

async function getViewablePackage(id: string) {
  const [deck, session] = await Promise.all([getDeckById(id), getSession()]);
  if (!deck || deck.kind !== "PACKAGE") return null;
  const isOwner = session?.userId === deck.userId;
  if (deck.visibility === "PRIVATE" && !isOwner) return null;
  return { pkg: deck, session, isOwner };
}

export async function generateMetadata({
  params,
}: PackagePageProps): Promise<Metadata> {
  // Runtime boundary: per-package metadata is inherently dynamic; keep its
  // `use cache` read out of the build-time collection pass (Neon). See sitemap.ts.
  await connection();
  const { id } = await params;
  const viewable = await getViewablePackage(id);
  if (!viewable) return NOT_FOUND_METADATA;
  return {
    title: `${viewable.pkg.name} · package`,
    robots: { index: false, follow: false },
  };
}

async function PackageContent({ params }: PackagePageProps) {
  // Runtime boundary: keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const { id } = await params;
  const viewable = await getViewablePackage(id);
  if (!viewable) notFound();
  const { pkg, session, isOwner } = viewable;

  const [viewerHoldings, viewerDecks] = session
    ? await Promise.all([
        getViewerHoldingsForDeck(pkg.id, session.userId),
        getDecksByUserMinimal(session.userId),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-8">
      <DeckRouteBridge deckId={pkg.id} isOwner={isOwner} />
      <div className="flex flex-col gap-3">
        <Eyebrow>
          {isOwner ? (
            <Link href="/packages" className="hover:text-foreground">
              Package
            </Link>
          ) : (
            "Package"
          )}
        </Eyebrow>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DeckNameEditor deckId={pkg.id} name={pkg.name} isOwner={isOwner} />
          <div className="flex items-center gap-2">
            {session && (
              <ApplyToDeckDialog
                packageId={pkg.id}
                packageName={pkg.name}
                decks={viewerDecks}
              />
            )}
            {isOwner && (
              <DeletePackageButton packageId={pkg.id} packageName={pkg.name} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {isOwner ? (
            <DeckVisibilityPicker
              deckId={pkg.id}
              visibility={pkg.visibility}
              descriptions={{
                UNLISTED: "Anyone with the link can view and add it",
                PUBLIC: "Listed on your profile; anyone can add it",
              }}
            />
          ) : (
            pkg.user?.username && (
              <span>
                by{" "}
                <Link
                  href={`/u/${pkg.user.username}`}
                  className="hover:text-foreground"
                >
                  {pkg.user.username}
                </Link>
              </span>
            )
          )}
        </div>
        <DeckDescriptionEditor
          deckId={pkg.id}
          description={pkg.description}
          isOwner={isOwner}
        />
      </div>
      <DeckBuilder
        deck={pkg}
        isOwner={isOwner}
        viewerId={session?.userId}
        viewerHoldings={viewerHoldings}
        toolbar={{ addLands: false }}
      />
    </div>
  );
}

export default function PackagePage({ params }: PackagePageProps) {
  return (
    <div className="px-4 md:px-8 py-6 max-w-[1800px] mx-auto">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <div className="h-4 w-20 rounded-md bg-muted animate-pulse" />
            <div className="h-10 w-60 rounded-md bg-muted animate-pulse" />
            <div className="h-[40px]" aria-hidden />
          </div>
        }
      >
        <PackageContent params={params} />
      </Suspense>
    </div>
  );
}
