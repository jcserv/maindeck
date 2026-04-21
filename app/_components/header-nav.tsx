"use client";

import { usePathname } from "next/navigation";
import Link from "@/app/_components/link";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/decks", label: "Decks" },
  { href: "/search", label: "Search" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      className="hidden md:flex items-center gap-0.5"
      aria-label="Main navigation"
    >
      {NAV_LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center h-8 px-3 rounded-md text-sm transition-colors",
              active
                ? "bg-muted text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/70 font-medium",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
