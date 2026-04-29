"use client";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuProps = {
  label: string;
  initials: string;
};

export function UserMenu({ label, initials }: UserMenuProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Signed in as ${label}`}
        className="inline-flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-md border bg-muted/40 hover:bg-muted transition-colors"
      >
        <span
          className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold"
          aria-hidden
        >
          {initials}
        </span>
        <span className="hidden sm:inline max-w-[120px] truncate text-xs text-muted-foreground">
          {label}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push("/decks")}>
          My Decks
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/account")}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            const { signOut } = await import("@/lib/auth/client");
            await signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
