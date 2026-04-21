import Link from "@/app/_components/link";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  buildHref: (page: number) => string;
  className?: string;
}

export function Pagination({
  page,
  total,
  pageSize,
  buildHref,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  const baseLink =
    "inline-flex items-center gap-1 font-mono text-[11.5px] uppercase tracking-[0.3px] text-muted-foreground hover:text-foreground transition-colors";
  const disabledLink =
    "inline-flex items-center gap-1 font-mono text-[11.5px] uppercase tracking-[0.3px] text-muted-foreground/40 pointer-events-none";

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex items-center justify-between gap-3 mt-10 sm:gap-4",
        className,
      )}
    >
      {prevDisabled ? (
        <span aria-disabled="true" className={disabledLink}>
          <span aria-hidden>←</span>
          Prev
        </span>
      ) : (
        <Link
          href={buildHref(page - 1)}
          aria-label="Previous page"
          className={baseLink}
        >
          <span aria-hidden>←</span>
          Prev
        </Link>
      )}

      <span className="font-mono text-[11.5px] uppercase tracking-[0.3px] text-muted-foreground">
        Page {page} of {totalPages}
      </span>

      {nextDisabled ? (
        <span aria-disabled="true" className={disabledLink}>
          Next
          <span aria-hidden>→</span>
        </span>
      ) : (
        <Link
          href={buildHref(page + 1)}
          aria-label="Next page"
          className={baseLink}
        >
          Next
          <span aria-hidden>→</span>
        </Link>
      )}
    </nav>
  );
}
