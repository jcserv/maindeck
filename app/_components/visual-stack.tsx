"use client";

import { useState } from "react";
import Image from "next/image";
import { type CardType } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/utils";

interface DeckCardRow {
  id: string;
  quantity: number;
  name: string;
  manaCost: string | null;
  imageUri: string;
  mainType: CardType;
  cmc: number | null;
}

interface VisualStackProps {
  cards: DeckCardRow[];
}

// Expand a cards array so that quantities are reflected as repeated entries
function expandCards(cards: DeckCardRow[]): DeckCardRow[] {
  return cards.flatMap((card) =>
    Array.from({ length: card.quantity }, (_, i) => ({
      ...card,
      // Give each expanded copy a unique key suffix
      id: i === 0 ? card.id : `${card.id}-${i}`,
    })),
  );
}

interface StackedCardProps {
  card: DeckCardRow;
  index: number;
}

const CARD_WIDTH_MOBILE = 140;
const CARD_HEIGHT_MOBILE = 195; // ~1.39 aspect ratio
const CARD_WIDTH_DESKTOP = 180;
const CARD_HEIGHT_DESKTOP = 251;
const OFFSET_MOBILE = 24;
const OFFSET_DESKTOP = 30;

function StackedCard({ card, index }: StackedCardProps) {
  const [lifted, setLifted] = useState(false);

  // Position card in the stack
  const mobileTop = index * OFFSET_MOBILE;

  return (
    <li
      className={cn(
        "absolute transition-transform duration-200 ease-out",
        // Desktop hover: translate up to reveal card below
        "group",
      )}
      style={{
        top: mobileTop,
        zIndex: index,
      }}
      // Desktop uses CSS group-hover via a parent, but each card lifts itself
    >
      <div
        className={cn(
          "relative cursor-pointer select-none",
          // Mobile: tap to lift
          lifted && "translate-y-[-60px]",
          // Desktop: hover to lift. Use negative translate proportional to card height
          "md:hover:-translate-y-[80%] md:hover:z-50 md:hover:relative",
          "transition-transform duration-200 ease-out will-change-transform",
        )}
        style={{ zIndex: lifted ? 50 : index }}
        onClick={() => setLifted((prev) => !prev)}
        onMouseLeave={() => setLifted(false)}
        role="img"
        aria-label={card.name}
        title={card.name}
      >
        <Image
          src={card.imageUri}
          alt={card.name}
          width={CARD_WIDTH_DESKTOP}
          height={CARD_HEIGHT_DESKTOP}
          quality={75}
          className={cn(
            "rounded-[4.5%/3.5%] shadow-md",
            "w-[140px] md:w-[180px]",
          )}
          // Cards further back in the stack load lazily
          loading={index < 3 ? "eager" : "lazy"}
        />
        {/* Bottom card tooltip on mobile */}
        <span className="sr-only">{card.name}</span>
      </div>
    </li>
  );
}

export function VisualStack({ cards }: VisualStackProps) {
  const expanded = expandCards(cards);
  const total = expanded.length;

  // Stack height = top of last card + full card height
  const mobileHeight = (total - 1) * OFFSET_MOBILE + CARD_HEIGHT_MOBILE;
  const desktopHeight = (total - 1) * OFFSET_DESKTOP + CARD_HEIGHT_DESKTOP;

  if (total === 0) return null;

  return (
    <ul
      className="relative list-none"
      style={{
        width: CARD_WIDTH_MOBILE,
        height: mobileHeight,
      }}
      // Override for desktop via inline style isn't ideal — use a data attr approach
      data-desktop-height={desktopHeight}
      aria-label={`Stack of ${total} card${total !== 1 ? "s" : ""}`}
    >
      {expanded.map((card, index) => (
        <StackedCard key={card.id} card={card} index={index} />
      ))}

      {/* Responsive height override */}
      <style>{`
        @media (min-width: 768px) {
          [data-desktop-height="${desktopHeight}"] {
            width: ${CARD_WIDTH_DESKTOP}px;
            height: ${desktopHeight}px;
          }
        }
      `}</style>
    </ul>
  );
}
