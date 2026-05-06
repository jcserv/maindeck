import { GitFork } from "lucide-react";
import Link from "@/app/_components/link";
import type { ForkAncestor } from "@/lib/deck/fork-queries";

interface ForkBreadcrumbProps {
  ancestors: ForkAncestor[];
}

/**
 * Renders the "Forked from @user / Deck" chain for a deck. PRIVATE ancestors
 * are masked at the SQL layer; here they collapse to "a private deck" so the
 * chain stays continuous without leaking identifying data.
 *
 * Hidden when the deck has no parent (empty ancestors list).
 */
export function ForkBreadcrumb({ ancestors }: ForkBreadcrumbProps) {
  if (ancestors.length === 0) return null;

  return (
    <nav
      aria-label="Fork chain"
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <GitFork className="size-3.5 shrink-0" aria-hidden />
      <span className="shrink-0">Forked from</span>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
        {ancestors.map((ancestor, idx) => (
          <li
            key={ancestor.masked ? `masked-${ancestor.depth}` : ancestor.id}
            className="flex items-center gap-1.5 min-w-0"
          >
            {idx > 0 && (
              <span aria-hidden className="text-muted-foreground/60">
                /
              </span>
            )}
            {ancestor.masked ? (
              <span className="italic">a private deck</span>
            ) : (
              <span className="inline-flex items-center gap-1 min-w-0">
                <Link
                  href={`/u/${ancestor.username}`}
                  className="text-foreground hover:underline truncate"
                >
                  @{ancestor.username}
                </Link>
                <span aria-hidden className="text-muted-foreground/60">
                  ·
                </span>
                <Link
                  href={`/deck/${ancestor.id}`}
                  className="text-foreground hover:underline truncate"
                >
                  {ancestor.name}
                </Link>
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
