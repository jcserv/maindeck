import type { Zone } from "@/lib/generated/prisma/enums";

type SerializeCard = {
  name: string;
};

type SerializePrinting = {
  setCode: string;
  collectorNumber: string;
} | null;

type DeckCardWithDetails = {
  quantity: number;
  zone: Zone;
  category: string | null;
  isFoil: boolean;
  printingId: number | null | undefined;
  card: SerializeCard;
  printing: SerializePrinting;
};

type DeckWithCards = {
  name: string;
  format: string;
  visibility: string;
  description: string | null | undefined;
  cards: DeckCardWithDetails[];
  categories: { name: string; sortOrder: number }[];
};

const ZONE_ORDER: Zone[] = ["COMMANDER", "MAINBOARD", "SIDEBOARD", "CONSIDERING"];

const ZONE_LABEL: Record<Zone, string> = {
  MAINBOARD: "Mainboard",
  SIDEBOARD: "Sideboard",
  CONSIDERING: "Considering",
  COMMANDER: "Commander",
};

function groupByZone(
  cards: DeckCardWithDetails[],
): Map<Zone, DeckCardWithDetails[]> {
  const map = new Map<Zone, DeckCardWithDetails[]>();
  for (const dc of cards) {
    const list = map.get(dc.zone) ?? [];
    list.push(dc);
    map.set(dc.zone, list);
  }
  return map;
}

function groupBySubcategory(
  cards: DeckCardWithDetails[],
  categories: { name: string; sortOrder: number }[],
): { ordered: string[]; grouped: Map<string, DeckCardWithDetails[]>; hasAny: boolean } {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const grouped = new Map<string, DeckCardWithDetails[]>();
  const ordered: string[] = [];

  for (const cat of sorted) {
    grouped.set(cat.name, []);
    ordered.push(cat.name);
  }
  const uncategorizedKey = "";
  grouped.set(uncategorizedKey, []);

  let hasAny = false;
  for (const dc of cards) {
    const key = dc.category ?? uncategorizedKey;
    if (dc.category) hasAny = true;
    if (!grouped.has(key)) {
      grouped.set(key, []);
      ordered.push(key);
    }
    grouped.get(key)!.push(dc);
  }

  // Put uncategorized last in ordered list.
  ordered.push(uncategorizedKey);
  return { ordered, grouped, hasAny };
}

export function toPlainText(deck: DeckWithCards): string {
  const byZone = groupByZone(deck.cards);
  const lines: string[] = [];

  for (const zone of ZONE_ORDER) {
    const cards = byZone.get(zone);
    if (!cards || cards.length === 0) continue;

    lines.push(`// ${ZONE_LABEL[zone]}`);

    if (zone === "MAINBOARD") {
      const { ordered, grouped, hasAny } = groupBySubcategory(
        cards,
        deck.categories,
      );
      if (hasAny) {
        const seen = new Set<string>();
        for (const key of ordered) {
          if (seen.has(key)) continue;
          seen.add(key);
          const group = grouped.get(key) ?? [];
          if (group.length === 0) continue;
          if (key) lines.push(`// ${key}`);
          for (const dc of group) {
            lines.push(`${dc.quantity} ${dc.card.name}`);
          }
        }
      } else {
        for (const dc of cards) {
          lines.push(`${dc.quantity} ${dc.card.name}`);
        }
      }
    } else {
      for (const dc of cards) {
        lines.push(`${dc.quantity} ${dc.card.name}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function toArena(deck: DeckWithCards): string {
  const byZone = groupByZone(deck.cards);
  const lines: string[] = [];

  const mainLines: string[] = [];
  const sideLines: string[] = [];

  // Arena treats Deck = MAINBOARD + COMMANDER (flattened), Sideboard = SIDEBOARD,
  // and ignores subcategories. Considering is not representable in Arena.
  const deckZones: Zone[] = ["COMMANDER", "MAINBOARD"];
  for (const zone of deckZones) {
    const cards = byZone.get(zone) ?? [];
    for (const dc of cards) {
      if (dc.printing) {
        mainLines.push(
          `${dc.quantity} ${dc.card.name} (${dc.printing.setCode.toUpperCase()}) ${dc.printing.collectorNumber}`,
        );
      } else {
        mainLines.push(`${dc.quantity} ${dc.card.name}`);
      }
    }
  }

  const sideboard = byZone.get("SIDEBOARD") ?? [];
  for (const dc of sideboard) {
    if (dc.printing) {
      sideLines.push(
        `${dc.quantity} ${dc.card.name} (${dc.printing.setCode.toUpperCase()}) ${dc.printing.collectorNumber}`,
      );
    } else {
      sideLines.push(`${dc.quantity} ${dc.card.name}`);
    }
  }

  if (mainLines.length > 0) {
    lines.push("Deck");
    lines.push(...mainLines);
  }

  if (sideLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Sideboard");
    lines.push(...sideLines);
  }

  return lines.join("\n");
}

type JsonCard = {
  name: string;
  quantity: number;
  zone: Zone;
  category: string | null;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
  printingId?: number;
};

type MaindeckJson = {
  name: string;
  format: string;
  visibility: string;
  description: string | null;
  cards: JsonCard[];
  categories: Array<{ name: string; sortOrder: number }>;
};

export function toMaindeckJson(deck: DeckWithCards): string {
  const cards: JsonCard[] = deck.cards
    .map((dc): JsonCard => ({
      name: dc.card.name,
      quantity: dc.quantity,
      zone: dc.zone,
      category: dc.category,
      set: dc.printing?.setCode?.toUpperCase(),
      collectorNumber: dc.printing?.collectorNumber,
      isFoil: dc.isFoil,
      printingId: dc.printingId ?? undefined,
    }))
    .sort((a, b) => {
      const zoneDiff = ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone);
      if (zoneDiff !== 0) return zoneDiff;
      return a.name.localeCompare(b.name);
    });

  const sortedCategories = [...deck.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ name: c.name, sortOrder: c.sortOrder }));

  const payload: MaindeckJson = {
    name: deck.name,
    format: deck.format,
    visibility: deck.visibility,
    description: deck.description ?? null,
    cards,
    categories: sortedCategories,
  };

  return JSON.stringify(payload, null, 2);
}
