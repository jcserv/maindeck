import { Suspense } from "react";
import Header from "@/app/_components/shell/header";
import MobileNav from "@/app/_components/shell/mobile-nav";
import { HeaderSearchProvider } from "@/app/_components/header-search/header-search-context";
import { DeckSearchProvider } from "@/app/_components/builder/deck-search-context";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderSearchProvider>
      <DeckSearchProvider>
        <div className="flex min-h-screen flex-col">
          <Suspense fallback={<div className="h-14 border-b" aria-hidden />}>
            <Header />
          </Suspense>
          <main className="flex-1 flex items-center justify-center px-4 py-12 pb-16 md:pb-0">
            {children}
          </main>
          <Suspense fallback={<div className="h-[56px] md:hidden" aria-hidden />}>
            <MobileNav />
          </Suspense>
        </div>
      </DeckSearchProvider>
    </HeaderSearchProvider>
  );
}
