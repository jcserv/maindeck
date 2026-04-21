"use client";

import { usePathname } from "next/navigation";
import { Home, Search, Library, Menu } from "lucide-react";
import Link from "@/app/_components/link";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/decks", label: "Decks", Icon: Library },
] as const;

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch">
        {NAV_LINKS.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px] py-2 text-xs font-medium transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn("h-5 w-5", isActive && "stroke-[2.25]")}
                aria-hidden
              />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* Menu — no route, placeholder button */}
        <button
          type="button"
          aria-label="Menu"
          className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px] py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Menu className="h-5 w-5" aria-hidden />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
