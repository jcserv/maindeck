"use client";

import { useHotkeys } from "react-hotkeys-hook";

export interface MenuShortcut {
  /** Single character or react-hotkeys-hook key string. */
  key: string;
  /** What to fire on press. */
  action: () => void;
  /** When true, the binding is silently skipped. */
  disabled?: boolean;
}

/**
 * Registers a set of single-key shortcuts that are only active while the
 * paired menu/popover is open. Fires once per keypress, prevents default,
 * and ignores presses originating in form fields.
 */
export function useMenuShortcuts(open: boolean, shortcuts: MenuShortcut[]) {
  const keys = shortcuts
    .filter((s) => !s.disabled)
    .map((s) => s.key)
    .join(",");

  useHotkeys(
    keys,
    (event, handler) => {
      const pressed = handler.keys?.[0] ?? event.key;
      const match = shortcuts.find(
        (s) => !s.disabled && normalizeKey(s.key) === normalizeKey(pressed),
      );
      if (!match) return;
      event.preventDefault();
      match.action();
    },
    {
      enabled: open && keys.length > 0,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [keys, shortcuts],
  );
}

function normalizeKey(k: string): string {
  return k.toLowerCase();
}
