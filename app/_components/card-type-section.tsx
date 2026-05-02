import { type CardType } from "@/lib/generated/prisma/client";
import { getCardTypeMeta } from "@/lib/card/types-meta";
import Link from "@/app/_components/link";
import { ManaCost } from "@/app/_components/mana-cost";
import { toNameSlug } from "@/lib/utils";

type SortOrder = "name-asc" | "name-desc" | "mv-asc" | "mv-desc" | "none";

interface DeckCardRow {
  id: string;
  quantity: number;
  name: string;
  manaCost: string | null;
  imageUri: string;
  mainType: CardType;
  cmc: number | null;
}

interface CardTypeSectionProps {
  cardType: CardType;
  cards: DeckCardRow[];
  sortOrder: SortOrder;
}

function sortCards(cards: DeckCardRow[], sortOrder: SortOrder): DeckCardRow[] {
  if (sortOrder === "none") return cards;

  return [...cards].sort((a, b) => {
    switch (sortOrder) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "mv-asc":
        return (a.cmc ?? 0) - (b.cmc ?? 0);
      case "mv-desc":
        return (b.cmc ?? 0) - (a.cmc ?? 0);
      default:
        return 0;
    }
  });
}

export function CardTypeSection({ cardType, cards, sortOrder }: CardTypeSectionProps) {
  const meta = getCardTypeMeta(cardType);
  const sorted = sortCards(cards, sortOrder);
  const total = cards.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <section aria-labelledby={`section-${cardType}`}>
      <h2
        id={`section-${cardType}`}
        className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2"
      >
        <span aria-hidden>{meta.emoji}</span>
        {meta.label}
        <span className="font-normal">({total})</span>
      </h2>
      <ul className="flex flex-col gap-0.5">
        {sorted.map((card) => (
          <li key={card.id} className="flex items-center gap-2 text-sm py-0.5">
            <span className="w-5 shrink-0 text-right text-muted-foreground font-mono text-xs">
              {card.quantity}
            </span>
            <Link
              href={`/card/${toNameSlug(card.name)}`}
              className="flex-1 min-w-0 truncate hover:text-primary transition-colors"
            >
              {card.name}
            </Link>
            {card.manaCost && (
              <ManaCost cost={card.manaCost} className="shrink-0" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
