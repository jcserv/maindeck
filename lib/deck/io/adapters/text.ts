import type { ParsedDecklist } from "../parse";
import {
  ZONE_LABEL,
  ZONE_ORDER,
  groupByZone,
  groupBySubcategory,
  parseLineBased,
} from "./_shared";
import type {
  DeckWithCards,
  DecklistParser,
  DecklistSerializer,
} from "./types";

function detect(input: string): number {
  const trimmed = input.trimStart();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) return 0;
  if (/^deck\s*$/im.test(input)) return 0.5;
  return 0.4;
}

function parse(input: string): ParsedDecklist {
  return parseLineBased(input, "text");
}

function serialize(deck: DeckWithCards): string {
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
          /* c8 ignore next */
          if (seen.has(key)) continue;
          seen.add(key);
          /* c8 ignore next */
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

export const textAdapter: DecklistParser & DecklistSerializer = {
  id: "text",
  detect,
  parse,
  serialize,
};
