export type ShortcutGroup =
  | "Global"
  | "Navigation"
  | "Deck row"
  | "Move card menu"
  | "Deck actions menu"
  | "User menu"
  | "Theme menu"
  | "Visibility menu"
  | "View toolbar"
  | "Printing picker"
  | "Export dialog"
  | "Bulk edit dialog";

export interface ShortcutEntry {
  id: string;
  keys: string[];
  label: string;
  group: ShortcutGroup;
}

export const SHORTCUTS: ShortcutEntry[] = [
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
  { id: "user.signout", keys: ["s"], label: "Sign out", group: "User menu" },

  { id: "theme.light", keys: ["l"], label: "Light", group: "Theme menu" },
  { id: "theme.dark", keys: ["d"], label: "Dark", group: "Theme menu" },
  { id: "theme.system", keys: ["s"], label: "System", group: "Theme menu" },

  { id: "vis.private", keys: ["p"], label: "Private", group: "Visibility menu" },
  { id: "vis.unlisted", keys: ["u"], label: "Unlisted", group: "Visibility menu" },
  { id: "vis.public", keys: ["b"], label: "Public", group: "Visibility menu" },

  { id: "view.group", keys: ["1", "…", "6"], label: "Group by (Category/Type/Color/MV/Set/Rarity)", group: "View toolbar" },
  { id: "view.sort", keys: ["n", "m", "p", "y"], label: "Sort by Name / Mana / Price / rarit-y", group: "View toolbar" },
  { id: "view.reverse", keys: ["r"], label: "Reverse sort direction", group: "View toolbar" },

  { id: "print.foil", keys: ["f"], label: "Toggle foil", group: "Printing picker" },
  { id: "print.confirm", keys: ["⏎"], label: "Select printing", group: "Printing picker" },

  { id: "export.text", keys: ["1"], label: "Plain text", group: "Export dialog" },
  { id: "export.arena", keys: ["2"], label: "Arena", group: "Export dialog" },
  { id: "export.json", keys: ["3"], label: "JSON", group: "Export dialog" },
  { id: "export.copy", keys: ["c"], label: "Copy to clipboard", group: "Export dialog" },
  { id: "export.download", keys: ["d"], label: "Download file", group: "Export dialog" },

  { id: "bulk.save", keys: ["⌘", "⏎"], label: "Save changes", group: "Bulk edit dialog" },
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "Global",
  "Navigation",
  "Deck row",
  "Move card menu",
  "Deck actions menu",
  "User menu",
  "Theme menu",
  "Visibility menu",
  "View toolbar",
  "Printing picker",
  "Export dialog",
  "Bulk edit dialog",
];
