"use client";

import { useCallback } from "react";

interface MenuShortcut {
  /** Single character matched against `event.key` (case-insensitive). */
  key: string;
  /** What to fire on press. */
  action: () => void;
  /** When true, the binding is silently skipped. */
  disabled?: boolean;
}

/**
 * Returns an `onKeyDown` handler to spread onto a popup. Running on the popup
 * lets us preventDefault/stopPropagation before Base UI's typeahead consumes
 * the keystroke.
 */
export function useMenuShortcuts(shortcuts: MenuShortcut[]) {
  return useCallback(
    (event: React.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const pressed = event.key.toLowerCase();
      const match = shortcuts.find(
        (s) => !s.disabled && s.key.toLowerCase() === pressed,
      );
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      match.action();
    },
    [shortcuts],
  );
}
