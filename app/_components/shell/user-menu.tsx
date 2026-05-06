"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMenuShortcuts } from "@/app/_components/hotkeys/use-menu-shortcuts";

type UserMenuProps = {
  label: string;
  initials: string;
};

export function UserMenu({ label, initials }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOutAndRedirect() {
    const { signOut } = await import("@/lib/auth/client");
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const onMenuKeyDown = useMenuShortcuts([
    {
      key: "d",
      action: () => {
        setOpen(false);
        router.push("/decks");
      },
    },
    {
      key: "s",
      action: () => {
        setOpen(false);
        router.push("/saved");
      },
    },
    {
      key: "a",
      action: () => {
        setOpen(false);
        router.push("/account");
      },
    },
  ]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
      <DropdownMenuContent align="end" onKeyDown={onMenuKeyDown}>
        <DropdownMenuItem onClick={() => router.push("/decks")}>
          My Decks
          <DropdownMenuShortcut>D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/saved")}>
          Saved Decks
          <DropdownMenuShortcut>S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/account")}>
          Settings
          <DropdownMenuShortcut>A</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void signOutAndRedirect()}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
