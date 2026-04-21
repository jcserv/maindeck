import DataLoader from "dataloader";
import { prisma } from "@/lib/db";
import type {
  Card,
  DeckCategory,
  Printing,
} from "@/lib/generated/prisma/client";

export type RequestLoaders = ReturnType<typeof createLoaders>;

export function createLoaders() {
  const cardById = new DataLoader<number, Card | null>(async (ids) => {
    const cards = await prisma.card.findMany({
      where: { id: { in: [...ids] } },
    });
    const map = new Map(cards.map((c) => [c.id, c]));
    return ids.map((id) => map.get(id) ?? null);
  });

  const printingsByCardId = new DataLoader<number, Printing[]>(
    async (cardIds) => {
      const printings = await prisma.printing.findMany({
        where: { cardId: { in: [...cardIds] } },
        orderBy: { id: "desc" },
      });
      const grouped = new Map<number, Printing[]>();
      for (const p of printings) {
        const arr = grouped.get(p.cardId) ?? [];
        arr.push(p);
        grouped.set(p.cardId, arr);
      }
      return cardIds.map((id) => grouped.get(id) ?? []);
    },
  );

  const categoriesByDeckId = new DataLoader<string, DeckCategory[]>(
    async (deckIds) => {
      const cats = await prisma.deckCategory.findMany({
        where: { deckId: { in: [...deckIds] } },
        orderBy: { sortOrder: "asc" },
      });
      const grouped = new Map<string, DeckCategory[]>();
      for (const c of cats) {
        const arr = grouped.get(c.deckId) ?? [];
        arr.push(c);
        grouped.set(c.deckId, arr);
      }
      return deckIds.map((id) => grouped.get(id) ?? []);
    },
  );

  const cardByName = new DataLoader<string, Card | null>(
    async (names) => {
      const cards = await prisma.card.findMany({
        where: { name: { in: [...names], mode: "insensitive" } },
      });
      const map = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
      return names.map((n) => map.get(n.toLowerCase()) ?? null);
    },
    { cacheKeyFn: (n: string) => n.toLowerCase() },
  );

  return { cardById, printingsByCardId, categoriesByDeckId, cardByName };
}
