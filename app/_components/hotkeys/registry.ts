type ShortcutGroup =
  | "Global"
  | "Navigation"
  | "Deck row"
  | "Move card menu"
  | "Deck actions menu"
  | "User menu"
  | "Printing picker"
  | "Bulk edit dialog";

export interface ShortcutEntry {
  id: string;
  keys: string[];
  label: string;
  group: ShortcutGroup;
}

const SHORTCUTS: ShortcutEntry[] = [
  { id: "global.search", keys: ["⌘K", "/"], label: "Focus card search", group: "Global" },
  { id: "global.cheatsheet", keys: ["?"], label: "Show keyboard shortcuts", group: "Global" },
  { id: "global.new", keys: ["n"], label: "New deck", group: "Global" },

  { id: "nav.decks", keys: ["g", "d"], label: "Go to your decks", group: "Navigation" },
  { id: "nav.home", keys: ["g", "h"], label: "Go home", group: "Navigation" },

  { id: "row.next", keys: ["→", "j"], label: "Next card", group: "Deck row" },
  { id: "row.prev", keys: ["←", "k"], label: "Previous card", group: "Deck row" },
  { id: "row.add", keys: ["+", "="], label: "Add one", group: "Deck row" },
  { id: "row.remove", keys: ["-"], label: "Remove one", group: "Deck row" },
  { id: "row.zone.commander", keys: ["1"], label: "Move to Commander", group: "Deck row" },
  { id: "row.zone.mainboard", keys: ["2"], label: "Move to Mainboard", group: "Deck row" },
  { id: "row.zone.sideboard", keys: ["3"], label: "Move to Sideboard", group: "Deck row" },
  { id: "row.zone.considering", keys: ["4"], label: "Move to Considering", group: "Deck row" },
  { id: "row.printing", keys: ["p"], label: "Change printing", group: "Deck row" },
  { id: "row.detail", keys: ["⏎"], label: "Open card detail", group: "Deck row" },
  { id: "row.delete", keys: ["⌫"], label: "Remove from deck", group: "Deck row" },

  { id: "move.add", keys: ["+"], label: "Add one", group: "Move card menu" },
  { id: "move.remove", keys: ["-"], label: "Remove one", group: "Move card menu" },
  { id: "move.printing", keys: ["p"], label: "Change printing", group: "Move card menu" },
  { id: "move.commander", keys: ["c"], label: "Commander zone", group: "Move card menu" },
  { id: "move.mainboard", keys: ["m"], label: "Mainboard zone", group: "Move card menu" },
  { id: "move.sideboard", keys: ["s"], label: "Sideboard zone", group: "Move card menu" },
  { id: "move.considering", keys: ["i"], label: "Considering zone", group: "Move card menu" },
  { id: "move.uncategorized", keys: ["0"], label: "Uncategorized", group: "Move card menu" },
  { id: "move.category", keys: ["1", "…", "9"], label: "Pick category", group: "Move card menu" },

  { id: "deck.bulkEdit", keys: ["b"], label: "Bulk edit", group: "Deck actions menu" },
  { id: "deck.export", keys: ["e"], label: "Export", group: "Deck actions menu" },
  { id: "deck.toggleView", keys: ["v"], label: "Toggle text/stack view", group: "Deck actions menu" },
  { id: "deck.actions.import", keys: ["i"], label: "Import", group: "Deck actions menu" },
  { id: "deck.actions.history", keys: ["h"], label: "History", group: "Deck actions menu" },
  { id: "deck.actions.delete", keys: ["d"], label: "Delete deck", group: "Deck actions menu" },

  { id: "user.decks", keys: ["d"], label: "My decks", group: "User menu" },
  { id: "user.account", keys: ["a"], label: "Account settings", group: "User menu" },

  { id: "print.foil", keys: ["f"], label: "Toggle foil", group: "Printing picker" },
  { id: "print.confirm", keys: ["⏎"], label: "Select printing", group: "Printing picker" },

  { id: "bulk.save", keys: ["⌘", "⏎"], label: "Save changes", group: "Bulk edit dialog" },
];

function filterShortcuts(query: string): ShortcutEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return SHORTCUTS;
  return SHORTCUTS.filter((entry) => {
    const haystack = `${entry.label} ${entry.group} ${entry.keys.join(" ")}`.toLowerCase();
    return haystack.includes(trimmed);
  });
}

interface ShortcutContext {
  inDeckEditor: boolean;
}

const DECK_EDITOR_GROUPS: ReadonlySet<ShortcutGroup> = new Set([
  "Deck row",
  "Move card menu",
  "Deck actions menu",
  "Printing picker",
  "Bulk edit dialog",
]);

function isShortcutRelevant(
  entry: ShortcutEntry,
  ctx: ShortcutContext,
): boolean {
  const isDeckGroup = DECK_EDITOR_GROUPS.has(entry.group);
  return ctx.inDeckEditor ? isDeckGroup : !isDeckGroup;
}

interface PartitionedShortcuts {
  relevant: ShortcutEntry[];
  other: ShortcutEntry[];
}

export function partitionShortcuts(
  query: string,
  ctx: ShortcutContext,
): PartitionedShortcuts {
  const matches = filterShortcuts(query);
  const relevant: ShortcutEntry[] = [];
  const other: ShortcutEntry[] = [];
  for (const entry of matches) {
    (isShortcutRelevant(entry, ctx) ? relevant : other).push(entry);
  }
  return { relevant, other };
}
