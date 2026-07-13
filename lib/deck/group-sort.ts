import type { OwnershipState } from "@/lib/inventory/state";

export type GroupBy =
  | "category"
  | "type"
  | "color"
  | "mv"
  | "set"
  | "rarity"
  | "ownership";
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
    printings?: ReadonlyArray<{
      priceUsd?: unknown;
      priceUsdFoil?: unknown;
    }>;
  };
  printing: {
    setCode: string;
    setName: string;
    priceUsd: number | null;
    priceUsdFoil?: number | null;
    rarity: string | null;
  } | null;
  /** Ordered category memberships; `[0]` is the primary. */
  categories: string[];
  isFoil?: boolean;
  /**
   * Set by `groupByCategory` on fan-out copies: the card appears in this
   * section through a non-primary membership. Secondary entries render
   * ghosted, are excluded from section counts, and are not draggable.
   */
  isSecondary?: boolean;
};

interface GroupedSection<T extends GroupSortCard> {
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
// Ordered most-to-least "in collection" so a builder scanning the list sees what
// they already have first and the gaps (wishlist, not owned) last.
const OWNERSHIP_ORDER: readonly OwnershipState[] = [
  "OWNED",
  "PARTIAL",
  "WISHLIST",
  "NOT_OWNED",
];
const OWNERSHIP_LABELS: Record<OwnershipState, string> = {
  OWNED: "Owned",
  PARTIAL: "Partially owned",
  WISHLIST: "Wishlist",
  NOT_OWNED: "Not owned",
};

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

type OrderedGroupBy = "type" | "color" | "mv" | "rarity";

interface OrderedStrategy {
  keyFn: <T extends GroupSortCard>(dc: T) => string;
  orderedKeys: readonly string[];
  labelOf: (key: string) => string;
  fallback?: { key: string; label: string };
}

const STRATEGIES: Record<OrderedGroupBy, OrderedStrategy> = {
  type: {
    keyFn: typeKey,
    orderedKeys: TYPE_ORDER,
    labelOf: (k) => k,
    fallback: { key: TYPE_OTHER, label: TYPE_OTHER },
  },
  color: {
    keyFn: colorKey,
    orderedKeys: COLOR_ORDER,
    // `k` is always one of COLOR_ORDER; the `?? k` fallback is a defensive
    // guard against type-narrowing slop.
    /* c8 ignore start */
    labelOf: (k) => COLOR_LABELS[k as (typeof COLOR_ORDER)[number]] ?? k,
    /* c8 ignore stop */
  },
  mv: {
    keyFn: mvKey,
    orderedKeys: MV_ORDER,
    labelOf: (k) => `MV ${k}`,
  },
  rarity: {
    keyFn: rarityKey,
    orderedKeys: RARITY_ORDER,
    labelOf: (k) => k,
    fallback: { key: RARITY_UNKNOWN, label: RARITY_UNKNOWN },
  },
};

function bucketize<T extends GroupSortCard>(
  cards: T[],
  keyFn: (dc: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const dc of cards) {
    const list = map.get(keyFn(dc));
    if (list) list.push(dc);
    else map.set(keyFn(dc), [dc]);
  }
  return map;
}

function groupByStrategy<T extends GroupSortCard>(
  cards: T[],
  strategy: OrderedStrategy,
): GroupedSection<T>[] {
  const map = bucketize(cards, strategy.keyFn);
  const sections: GroupedSection<T>[] = [];
  for (const key of strategy.orderedKeys) {
    const list = map.get(key);
    if (list && list.length > 0) {
      sections.push({ key, label: strategy.labelOf(key), cards: list });
    }
  }
  if (strategy.fallback) {
    const list = map.get(strategy.fallback.key);
    if (list && list.length > 0) {
      sections.push({
        key: strategy.fallback.key,
        label: strategy.fallback.label,
        cards: list,
      });
    }
  }
  return sections;
}

function groupByCategory<T extends GroupSortCard>(
  cards: T[],
  categoryOrder: string[],
): GroupedSection<T>[] {
  const map = new Map<string, T[]>();
  for (const name of categoryOrder) map.set(name, []);
  map.set(UNCATEGORIZED_KEY, []);
  for (const dc of cards) {
    // Fan out: the card appears in every member section — in full under its
    // primary (categories[0]), ghosted under each secondary membership.
    // Zero memberships land in Uncategorized.
    const memberships =
      dc.categories.length === 0 ? [UNCATEGORIZED_KEY] : dc.categories;
    for (const key of memberships) {
      if (!map.has(key)) map.set(key, []);
      const isSecondary = key !== memberships[0];
      map.get(key)!.push(isSecondary ? { ...dc, isSecondary: true } : dc);
    }
  }
  const sections: GroupedSection<T>[] = [];
  for (const name of categoryOrder) {
    /* c8 ignore next */
    sections.push({ key: name, label: name, cards: map.get(name) ?? [] });
  }
  for (const key of map.keys()) {
    if (key === UNCATEGORIZED_KEY) continue;
    if (categoryOrder.includes(key)) continue;
    /* c8 ignore next */
    sections.push({ key, label: key, cards: map.get(key) ?? [] });
  }
  /* c8 ignore next */
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

function groupBySet<T extends GroupSortCard>(cards: T[]): GroupedSection<T>[] {
  const byCode = new Map<string, { label: string; cards: T[] }>();
  const missing: T[] = [];
  for (const dc of cards) {
    if (!dc.printing) {
      missing.push(dc);
      continue;
    }
    const code = dc.printing.setCode;
    let bucket = byCode.get(code);
    if (!bucket) {
      bucket = { label: dc.printing.setName, cards: [] };
      byCode.set(code, bucket);
    }
    bucket.cards.push(dc);
  }
  const sections: GroupedSection<T>[] = [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, { label, cards: list }]) => ({ key: code, label, cards: list }));
  if (missing.length > 0) {
    sections.push({ key: "__no_printing__", label: "No printing", cards: missing });
  }
  return sections;
}

function groupByOwnership<T extends GroupSortCard>(
  cards: T[],
  ownershipOf: (dc: T) => OwnershipState,
): GroupedSection<T>[] {
  const map = bucketize(cards, ownershipOf);
  const sections: GroupedSection<T>[] = [];
  for (const key of OWNERSHIP_ORDER) {
    const list = map.get(key);
    if (list && list.length > 0) {
      sections.push({ key, label: OWNERSHIP_LABELS[key], cards: list });
    }
  }
  return sections;
}

// Ownership isn't derivable from a card alone — it depends on the viewer's
// holdings — so callers grouping by ownership must supply `ownershipOf`. Without
// it (e.g. a logged-out viewer) every card resolves to NOT_OWNED.
export function groupCards<T extends GroupSortCard>(
  cards: T[],
  groupBy: GroupBy,
  categoryOrder: string[] = [],
  ownershipOf?: (dc: T) => OwnershipState,
): GroupedSection<T>[] {
  if (groupBy === "category") return groupByCategory(cards, categoryOrder);
  if (groupBy === "set") return groupBySet(cards);
  if (groupBy === "ownership") {
    return groupByOwnership(cards, ownershipOf ?? (() => "NOT_OWNED"));
  }
  return groupByStrategy(cards, STRATEGIES[groupBy]);
}

function compareNumbers(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
}

function compareStrings(a: string, b: string, dir: SortDir): number {
  const r = a.localeCompare(b);
  return dir === "asc" ? r : -r;
}

function effectivePrice<T extends GroupSortCard>(dc: T): number | null {
  const pinned = dc.printing;
  const canonical = dc.card.printings?.[0] as
    | { priceUsd?: number | null; priceUsdFoil?: number | null }
    | undefined;
  const source = pinned ?? canonical;
  if (!source) return null;
  const usd = source.priceUsd ?? null;
  const foil = source.priceUsdFoil ?? null;
  const primary = dc.isFoil ? foil : usd;
  const fallback = dc.isFoil ? usd : foil;
  return primary ?? fallback;
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
      const av = effectivePrice(a);
      const bv = effectivePrice(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return compareNumbers(av, bv, dir);
    });
    return copy;
  }

  // SortKey is exhaustively handled above; by elimination key === "rarity"
  // here. The `if` is a defensive guard, so its false branch and the trailing
  // default `return copy` are unreachable.
  /* c8 ignore start */
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
  /* c8 ignore stop */
}
