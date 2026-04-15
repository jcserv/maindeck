import { CardType } from "@/lib/generated/prisma/client";

export { CardType };

export function getMainType(typeLine: string | undefined | null): CardType {
  if (!typeLine) return CardType.Unknown;

  let cardType = typeLine;
  // For MDFCs, use the front face's type.
  if (cardType.includes("//")) {
    cardType = cardType.split("//")[0];
  }

  // Old cards: "Enchant Creature" → Enchantment
  if (cardType.startsWith("Enchant ")) return CardType.Enchantment;
  if (cardType.includes("Planeswalker")) return CardType.Planeswalker;
  if (cardType.includes("Battle")) return CardType.Battle;
  if (cardType.includes("Land")) return CardType.Land;
  if (cardType.includes("Creature")) return CardType.Creature;
  if (cardType.includes("Artifact")) return CardType.Artifact;
  if (cardType.includes("Enchantment")) return CardType.Enchantment;
  if (cardType.includes("Sorcery")) return CardType.Sorcery;
  if (cardType.includes("Instant")) return CardType.Instant;
  return CardType.Unknown;
}
