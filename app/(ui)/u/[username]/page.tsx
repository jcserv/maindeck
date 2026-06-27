import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "@/app/_components/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DeckCardPreview } from "@/app/_components/decks/deck-card-preview";
import { getSession } from "@/lib/auth/session";
import { selectDeckPreviewImages } from "@/lib/deck/queries";
import {
  getPublicProfile,
  getUserPublicDecks,
  getUserUnlistedDecks,
  PROFILE_DECKS_PAGE_SIZE,
  type ProfileDeck,
} from "@/lib/user/queries";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string; unlistedPage?: string }>;
}

function parsePage(raw: string | undefined): number {
  const n = parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function DeckGrid({ decks }: { decks: ProfileDeck[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {decks.map((deck) => (
        <DeckCardPreview
          key={deck.id}
          id={deck.id}
          name={deck.name}
          format={deck.format}
          visibility={deck.visibility}
          cardCount={deck.cardCount}
          updatedAt={deck.updatedAt}
          previewImages={selectDeckPreviewImages(deck.format, deck.cards)}
        />
      ))}
    </div>
  );
}

function Paginator({
  page,
  total,
  paramName,
}: {
  page: number;
  total: number;
  paramName: "page" | "unlistedPage";
}) {
  const totalPages = Math.max(1, Math.ceil(total / PROFILE_DECKS_PAGE_SIZE));
  if (totalPages <= 1) return null;

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  return (
    <nav
      className="mt-6 flex items-center justify-between gap-3"
      aria-label="Pagination"
    >
      <Link
        href={`?${paramName}=${prev}`}
        aria-disabled={page === 1}
        className={
          page === 1
            ? "text-sm text-muted-foreground pointer-events-none opacity-50"
            : "text-sm text-foreground hover:underline"
        }
      >
        Previous
      </Link>
      <span className="text-xs font-mono text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Link
        href={`?${paramName}=${next}`}
        aria-disabled={page === totalPages}
        className={
          page === totalPages
            ? "text-sm text-muted-foreground pointer-events-none opacity-50"
            : "text-sm text-foreground hover:underline"
        }
      >
        Next
      </Link>
    </nav>
  );
}

async function ProfileContent({
  username,
  page,
  unlistedPage,
}: {
  username: string;
  page: number;
  unlistedPage: number;
}) {
  // Runtime boundary — keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const [profile, session] = await Promise.all([
    getPublicProfile(username),
    getSession(),
  ]);
  if (!profile) notFound();

  const isOwner = session?.userId === profile.id;
  const publicPage = await getUserPublicDecks(profile.id, page);

  // Non-owner with no public decks → 404. Owner with no public decks still
  // sees their profile (with the Unlisted section).
  if (!isOwner && publicPage.total === 0) notFound();

  const unlistedPageData = isOwner
    ? await getUserUnlistedDecks(profile.id, unlistedPage)
    : null;

  return (
    <>
      <header className="mb-10">
        <Eyebrow className="mb-3">Profile</Eyebrow>
        <h1 className="text-5xl font-medium leading-none tracking-tight">
          @{profile.username}
        </h1>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium">Public decks</h2>
        {publicPage.decks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No public decks yet.</p>
        ) : (
          <>
            <DeckGrid decks={publicPage.decks} />
            <Paginator
              page={page}
              total={publicPage.total}
              paramName="page"
            />
          </>
        )}
      </section>

      {isOwner && unlistedPageData ? (
        <section>
          <h2 className="mb-4 text-lg font-medium">Unlisted</h2>
          {unlistedPageData.decks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unlisted decks.
            </p>
          ) : (
            <>
              <DeckGrid decks={unlistedPageData.decks} />
              <Paginator
                page={unlistedPage}
                total={unlistedPageData.total}
                paramName="unlistedPage"
              />
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <div className="mb-10 h-[80px] w-[280px] rounded-md bg-muted animate-pulse" />
      <div className="mb-4 h-[24px] w-[140px] rounded bg-muted animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl bg-muted animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    </>
  );
}

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const { username } = await params;
  const raw = await searchParams;
  const page = parsePage(raw.page);
  const unlistedPage = parsePage(raw.unlistedPage);

  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent
          username={username}
          page={page}
          unlistedPage={unlistedPage}
        />
      </Suspense>
    </div>
  );
}
