import { GitFork } from "lucide-react";
import Link from "@/app/_components/link";
import {
  PUBLIC_FORKS_PAGE_SIZE,
  getPublicForks,
  type PublicForkSummary,
} from "@/lib/deck/fork-queries";

interface ForkDescendantsProps {
  deckId: string;
  page: number;
}

function formatLabel(format: string): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

/**
 * Server component: paginated rail of public forks of a deck. Renders nothing
 * when N=0 so private/unforked decks don't show an empty section.
 */
export async function ForkDescendants({ deckId, page }: ForkDescendantsProps) {
  const { forks, total } = await getPublicForks(deckId, page);
  if (total === 0) return null;

  const pageSize = PUBLIC_FORKS_PAGE_SIZE;
  const safePage = Math.max(1, page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = safePage > 1;
  const hasNext = safePage < totalPages;

  return (
    <section aria-labelledby="fork-descendants-heading">
      <div className="flex items-center justify-between mb-3">
        <h2
          id="fork-descendants-heading"
          className="text-sm font-semibold text-muted-foreground uppercase tracking-wide"
        >
          Forks ({total})
        </h2>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ForkPageLink
              deckId={deckId}
              page={safePage - 1}
              disabled={!hasPrev}
            >
              Prev
            </ForkPageLink>
            <span aria-live="polite">
              Page {safePage} of {totalPages}
            </span>
            <ForkPageLink
              deckId={deckId}
              page={safePage + 1}
              disabled={!hasNext}
            >
              Next
            </ForkPageLink>
          </div>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {forks.map((fork) => (
          <ForkCard key={fork.id} fork={fork} />
        ))}
      </ul>
    </section>
  );
}

function ForkCard({ fork }: { fork: PublicForkSummary }) {
  return (
    <li className="rounded-md border bg-card hover:bg-muted/40 transition-colors">
      <Link
        href={`/deck/${fork.id}`}
        className="flex flex-col gap-1 px-4 py-3"
      >
        <span className="text-sm font-medium truncate">{fork.name}</span>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 min-w-0">
          <GitFork className="size-3 shrink-0" aria-hidden />
          <span className="truncate">@{fork.user.username}</span>
          <span aria-hidden className="text-muted-foreground/60">
            ·
          </span>
          <span className="truncate">{formatLabel(fork.format)}</span>
        </span>
      </Link>
    </li>
  );
}

function ForkPageLink({
  deckId,
  page,
  disabled,
  children,
}: {
  deckId: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="px-2 py-1 rounded text-muted-foreground/50"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={`/deck/${deckId}?forks=${page}#fork-descendants-heading`}
      className="px-2 py-1 rounded hover:bg-muted text-foreground"
    >
      {children}
    </Link>
  );
}
