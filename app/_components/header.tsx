import { Suspense } from "react";
import AuthSkeleton from "@/app/_components/auth-skeleton";
import UserChip from "@/app/_components/user-chip";
import { HeaderNav } from "@/app/_components/header-nav";
import Link from "@/app/_components/link";
import { HeaderSearchBar } from "@/app/_components/header-search-bar";
import { ThemeToggle } from "@/app/_components/theme-toggle";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
      <div className="relative flex h-14 items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-lg tracking-tight shrink-0"
          aria-label="Maindeck home"
        >
          <span
            className="inline-flex size-[22px] items-center justify-center rounded-sm bg-foreground text-background font-semibold italic text-[13px] font-heading"
            aria-hidden
          >
            m
          </span>
          <span className="hidden sm:inline">maindeck</span>
        </Link>

        <span className="h-5 w-px bg-border hidden md:block" aria-hidden />

        <HeaderNav />

        <div className="hidden md:block flex-1" />

        <div className="hidden md:block w-full max-w-xl shrink">
          <HeaderSearchBar />
        </div>

        <div className="hidden md:block flex-1" />

        <div className="md:hidden flex-1">
          <HeaderSearchBar />
        </div>

        <ThemeToggle />

        <Suspense fallback={<AuthSkeleton />}>
          <UserChip />
        </Suspense>
      </div>
    </header>
  );
}
