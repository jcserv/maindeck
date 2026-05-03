import { CardType } from "@/lib/generated/prisma/enums";

type CardTypeMeta = {
  label: string;
  emoji: string;
  /** Lower numbers sort earlier in the default deck view. */
  order: number;
};

const META: Record<CardType, CardTypeMeta> = {
  [CardType.Battle]: { label: "Battle", emoji: "⚔️", order: 0 },
  [CardType.Planeswalker]: { label: "Planeswalker", emoji: "🧙", order: 1 },
  [CardType.Creature]: { label: "Creature", emoji: "🦖", order: 2 },
  [CardType.Instant]: { label: "Instant", emoji: "⚡", order: 3 },
  [CardType.Sorcery]: { label: "Sorcery", emoji: "🌀", order: 4 },
  [CardType.Artifact]: { label: "Artifact", emoji: "⚙️", order: 5 },
  [CardType.Enchantment]: { label: "Enchantment", emoji: "✨", order: 6 },
  [CardType.Land]: { label: "Land", emoji: "🗺️", order: 7 },
  [CardType.Kindred]: { label: "Kindred", emoji: "👥", order: 8 },
  [CardType.Conspiracy]: { label: "Conspiracy", emoji: "🕵️", order: 9 },
  [CardType.Dungeon]: { label: "Dungeon", emoji: "🏰", order: 10 },
  [CardType.Phenomenon]: { label: "Phenomenon", emoji: "🌌", order: 11 },
  [CardType.Plane]: { label: "Plane", emoji: "🪐", order: 12 },
  [CardType.Scheme]: { label: "Scheme", emoji: "🎭", order: 13 },
  [CardType.Vanguard]: { label: "Vanguard", emoji: "🛡️", order: 14 },
  [CardType.Unknown]: { label: "Other", emoji: "❔", order: 15 },
};

export function getCardTypeMeta(type: CardType): CardTypeMeta {
  return META[type];
}
