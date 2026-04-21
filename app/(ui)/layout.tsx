import { Suspense, type ReactNode } from "react";
import Header from "@/app/_components/header";
import MobileNav from "@/app/_components/mobile-nav";
import { HeaderSearchProvider } from "@/app/_components/header-search-context";
import { DeckSearchProvider } from "@/app/_components/deck-search-context";

export default function UILayout({ children }: { children: ReactNode }) {
  return (
    <HeaderSearchProvider>
      <DeckSearchProvider>
        <div className="flex min-h-screen flex-col">
          <Suspense fallback={<div className="h-14 border-b" aria-hidden />}>
            <Header />
          </Suspense>
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          {/* Suspense isolates usePathname() from static prerender */}
          <Suspense fallback={<div className="h-[56px] md:hidden" aria-hidden />}>
            <MobileNav />
          </Suspense>
        </div>
      </DeckSearchProvider>
    </HeaderSearchProvider>
  );
}
