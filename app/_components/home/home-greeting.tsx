import Link from "@/app/_components/link";
import { Eyebrow } from "@/components/ui/eyebrow";

interface HomeGreetingProps {
  username: string;
}

export function HomeGreeting({ username }: HomeGreetingProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-5 mb-9 flex-wrap">
      <div>
        <Eyebrow className="mb-2.5">Welcome back</Eyebrow>
        <h1 className="font-display text-[clamp(36px,6vw,72px)] font-medium leading-none tracking-[-0.03em] m-0">
          Good to see you,{" "}
          <em className="not-italic text-primary">{username}</em>.
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/deck/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          aria-label="New deck"
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New deck
        </Link>
        <Link
          href="/decks"
          className="inline-flex items-center gap-2 rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          aria-label="All decks"
        >
          All decks
        </Link>
      </div>
    </div>
  );
}
