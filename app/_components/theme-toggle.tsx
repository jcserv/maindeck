"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMenuShortcuts } from "@/app/_components/hotkeys/use-menu-shortcuts";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);

  const Icon =
    mounted && resolvedTheme === "dark" ? Moon : mounted ? Sun : null;

  useMenuShortcuts(open, [
    {
      key: "l",
      action: () => {
        setOpen(false);
        setTheme("light");
      },
    },
    {
      key: "d",
      action: () => {
        setOpen(false);
        setTheme("dark");
      },
    },
    {
      key: "s",
      action: () => {
        setOpen(false);
        setTheme("system");
      },
    },
  ]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Toggle theme"
        className="inline-flex items-center justify-center size-8 rounded-md border bg-muted/40 hover:bg-muted transition-colors"
      >
        {Icon ? (
          <Icon className="size-4" aria-hidden />
        ) : (
          <span className="inline-block size-4" aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          data-active={theme === "light"}
        >
          <Sun className="size-4" aria-hidden />
          Light
          <DropdownMenuShortcut>L</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          data-active={theme === "dark"}
        >
          <Moon className="size-4" aria-hidden />
          Dark
          <DropdownMenuShortcut>D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          data-active={theme === "system"}
        >
          <Monitor className="size-4" aria-hidden />
          System
          <DropdownMenuShortcut>S</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
