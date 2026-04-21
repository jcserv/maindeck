export type GroupBy = "category" | "type" | "color" | "mv" | "set" | "rarity";
export type SortKey = "name" | "mv" | "price" | "rarity";
export type SortDir = "asc" | "desc";

const SORT_VALUES: readonly SortKey[] = ["name", "mv", "price", "rarity"];

export function parseSortKey(raw: string | null): SortKey {
  return SORT_VALUES.includes(raw as SortKey) ? (raw as SortKey) : "name";
}

export function parseSortDir(raw: string | null): SortDir {
  return raw === "desc" ? "desc" : "asc";
}

export type GroupSortCard = {
  card: {
    name: string;
    mainType: string;
    colors: string[];
    cmc: number | null;
  };
  printing: {
    setCode: string;
    setName: string;
    priceUsd: number | null;
    rarity: string | null;
  } | null;
  category: string | null;
};

export interface GroupedSection<T extends GroupSortCard> {
  key: string;
  label: string;
  cards: T[];
}

const UNCATEGORIZED_KEY = "__uncategorized__";
const UNCATEGORIZED_LABEL = "Uncategorized";

const TYPE_ORDER = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Kindred",
  "Land",
] as const;
const TYPE_OTHER = "Other";

const COLOR_ORDER = [
  "W",
  "U",
  "B",
  "R",
  "G",
  "Multicolor",
  "Colorless",
  "Land",
] as const;

const COLOR_LABELS: Record<(typeof COLOR_ORDER)[number], string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  Multicolor: "Multicolor",
  Colorless: "Colorless",
  Land: "Lands",
};

const MV_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7+"] as const;

const RARITY_ORDER = [
  "Mythic",
  "Rare",
  "Uncommon",
  "Common",
  "Special",
  "Bonus",
] as const;
const RARITY_UNKNOWN = "Unknown";
const RARITY_INDEX: Record<string, number> = {
  Mythic: 0,
  Rare: 1,
  Uncommon: 2,
  Common: 3,
  Special: 4,
  Bonus: 5,
};

function typeKey<T extends GroupSortCard>(dc: T): string {
  const t = dc.card.mainType;
  return (TYPE_ORDER as readonly string[]).includes(t) ? t : TYPE_OTHER;
}

function colorKey<T extends GroupSortCard>(dc: T): string {
  if (dc.card.mainType === "Land") return "Land";
  const colors = dc.card.colors ?? [];
  if (colors.length === 0) return "Colorless";
  if (colors.length === 1) {
    const c = colors[0];
    return c === "W" || c === "U" || c === "B" || c === "R" || c === "G"
      ? c
      : "Colorless";
  }
  return "Multicolor";
}

function mvKey<T extends GroupSortCard>(dc: T): string {
  const mv = dc.card.cmc ?? 0;
  return mv >= 7 ? "7+" : String(Math.floor(mv));
}

function rarityKey<T extends GroupSortCard>(dc: T): string {
  const r = dc.printing?.rarity;
  if (!r) return RARITY_UNKNOWN;
  return (RARITY_ORDER as readonly string[]).includes(r) ? r : RARITY_UNKNOWN;
}

export function groupCards<T extends GroupSortCard>(
  cards: T[],
  groupBy: GroupBy,
  categoryOrder: string[] = [],
): GroupedSection<T>[] {
  if (groupBy === "category") {
    const map = new Map<string, T[]>();
    for (const name of categoryOrder) map.set(name, []);
    map.set(UNCATEGORIZED_KEY, []);
    for (const dc of cards) {
      const key = dc.category ?? UNCATEGORIZED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dc);
    }
    const sections: GroupedSection<T>[] = [];
    for (const name of categoryOrder) {
      sections.push({ key: name, label: name, cards: map.get(name) ?? [] });
    }
    for (const key of map.keys()) {
      if (key === UNCATEGORIZED_KEY) continue;
      if (categoryOrder.includes(key)) continue;
      sections.push({ key, label: key, cards: map.get(key) ?? [] });
    }
    const uncategorized = map.get(UNCATEGORIZED_KEY) ?? [];
    if (uncategorized.length > 0) {
      sections.push({
        key: UNCATEGORIZED_KEY,
        label: UNCATEGORIZED_LABEL,
        cards: uncategorized,
      });
    }
    return sections;
  }

  if (groupBy === "type") {
    const map = new Map<string, T[]>();
    for (const dc of cards) {
      const key = typeKey(dc);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dc);
    }
    const sections: GroupedSection<T>[] = [];
    for (const key of TYPE_ORDER) {
      const list = map.get(key);
      if (list && list.length > 0) {
        sections.push({ key, label: key, cards: list });
      }
    }
    const others = map.get(TYPE_OTHER);
    if (others && others.length > 0) {
      sections.push({ key: TYPE_OTHER, label: TYPE_OTHER, cards: others });
    }
    return sections;
  }

  if (groupBy === "color") {
    const map = new Map<string, T[]>();
    for (const dc of cards) {
      const key = colorKey(dc);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dc);
    }
    const sections: GroupedSection<T>[] = [];
    for (const key of COLOR_ORDER) {
      const list = map.get(key);
      if (list && list.length > 0) {
        sections.push({ key, label: COLOR_LABELS[key], cards: list });
      }
    }
    return sections;
  }

  if (groupBy === "mv") {
    const map = new Map<string, T[]>();
    for (const dc of cards) {
      const key = mvKey(dc);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dc);
    }
    const sections: GroupedSection<T>[] = [];
    for (const key of MV_ORDER) {
      const list = map.get(key);
      if (list && list.length > 0) {
        sections.push({ key, label: `MV ${key}`, cards: list });
      }
    }
    return sections;
  }

  if (groupBy === "set") {
    const byCode = new Map<string, { label: string; cards: T[] }>();
    const missing: T[] = [];
    for (const dc of cards) {
      if (!dc.printing) {
        missing.push(dc);
        continue;
      }
      const code = dc.printing.setCode;
      if (!byCode.has(code)) {
        byCode.set(code, { label: dc.printing.setName, cards: [] });
      }
      byCode.get(code)!.cards.push(dc);
    }
    const sections: GroupedSection<T>[] = [...byCode.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, { label, cards: list }]) => ({
        key: code,
        label,
        cards: list,
      }));
    if (missing.length > 0) {
      sections.push({
        key: "__no_printing__",
        label: "No printing",
        cards: missing,
      });
    }
    return sections;
  }

  if (groupBy === "rarity") {
    const map = new Map<string, T[]>();
    for (const dc of cards) {
      const key = rarityKey(dc);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dc);
    }
    const sections: GroupedSection<T>[] = [];
    for (const key of RARITY_ORDER) {
      const list = map.get(key);
      if (list && list.length > 0) {
        sections.push({ key, label: key, cards: list });
      }
    }
    const unknown = map.get(RARITY_UNKNOWN);
    if (unknown && unknown.length > 0) {
      sections.push({
        key: RARITY_UNKNOWN,
        label: RARITY_UNKNOWN,
        cards: unknown,
      });
    }
    return sections;
  }

  return [{ key: "all", label: "All", cards: [...cards] }];
}

function compareNumbers(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
}

function compareStrings(a: string, b: string, dir: SortDir): number {
  const r = a.localeCompare(b);
  return dir === "asc" ? r : -r;
}

export function sortCards<T extends GroupSortCard>(
  cards: T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  const copy = [...cards];

  if (key === "name") {
    copy.sort((a, b) => compareStrings(a.card.name, b.card.name, dir));
    return copy;
  }

  if (key === "mv") {
    copy.sort((a, b) =>
      compareNumbers(a.card.cmc ?? 0, b.card.cmc ?? 0, dir),
    );
    return copy;
  }

  if (key === "price") {
    copy.sort((a, b) => {
      const av = a.printing?.priceUsd ?? null;
      const bv = b.printing?.priceUsd ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return compareNumbers(Number(av), Number(bv), dir);
    });
    return copy;
  }

  if (key === "rarity") {
    copy.sort((a, b) => {
      const ar = a.printing?.rarity ?? null;
      const br = b.printing?.rarity ?? null;
      const ai = ar ? (RARITY_INDEX[ar] ?? Infinity) : Infinity;
      const bi = br ? (RARITY_INDEX[br] ?? Infinity) : Infinity;
      if (ai === Infinity && bi === Infinity) return 0;
      if (ai === Infinity) return 1;
      if (bi === Infinity) return -1;
      return compareNumbers(ai, bi, dir);
    });
    return copy;
  }

  return copy;
}
