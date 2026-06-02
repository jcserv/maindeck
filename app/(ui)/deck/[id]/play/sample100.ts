import { shuffleDeck } from "@/lib/deck/shuffle";
import { mulberry32 } from "./prng";
import type { PlaytestCard } from "./playtest-reducer";

export interface Sample100Result {
  keepRate: number;
  categoryHitByTurn3: Record<string, number>;
  manaStats: { mean: number; stddev: number; zero: number; one: number };
  sampleKeep: PlaytestCard[] | null;
  sampleMull: PlaytestCard[] | null;
}

function isLandSource(card: PlaytestCard): boolean {
  return card.typeLine?.toLowerCase().includes("land") ?? false;
}

function shouldKeep(hand: PlaytestCard[]): boolean {
  const lands = hand.filter(isLandSource).length;
  return lands >= 2 && lands <= 5;
}

function drawN(library: PlaytestCard[], n: number): PlaytestCard[] {
  return library.slice(0, Math.min(n, library.length));
}

export function runSample100(
  cards: PlaytestCard[],
  categories: string[],
  baseSeed: number,
): Sample100Result {
  let kept = 0;
  let sampleKeep: PlaytestCard[] | null = null;
  let sampleMull: PlaytestCard[] | null = null;

  const categoryHits: Record<string, number> = {};
  for (const cat of categories) categoryHits[cat] = 0;

  const landCounts: number[] = [];

  for (let i = 0; i < 100; i++) {
    const prng = mulberry32(baseSeed + i * 7919);
    const shuffled = shuffleDeck([...cards], prng);

    const hand7 = drawN(shuffled, 7);
    const keep7 = shouldKeep(hand7);

    if (keep7) {
      kept++;
      if (!sampleKeep) sampleKeep = hand7;
    } else {
      // London mulligan to 6
      const prng2 = mulberry32(baseSeed + i * 7919 + 1);
      const shuffled2 = shuffleDeck([...cards], prng2);
      const hand6 = drawN(shuffled2, 6);
      if (shouldKeep(hand6)) {
        kept++;
        if (!sampleKeep) sampleKeep = hand6;
      } else {
        if (!sampleMull) sampleMull = hand7;
      }
    }

    const finalHand = keep7 ? hand7 : drawN(shuffleDeck([...cards], mulberry32(baseSeed + i * 7919 + 1)), 6);
    const landCount = finalHand.filter(isLandSource).length;
    landCounts.push(landCount);

    // category hit by turn 3 = card in opening hand+3 draws has that category
    const turn3Cards = [...finalHand, ...drawN(shuffled.slice(finalHand.length), 3)];
    // We don't have category on PlaytestCard so use typeLine heuristics per category name
    for (const cat of categories) {
      const catLower = cat.toLowerCase();
      if (turn3Cards.some((c) => c.typeLine?.toLowerCase().includes(catLower) || c.name.toLowerCase().includes(catLower))) {
        categoryHits[cat] = (categoryHits[cat] ?? 0) + 1;
      }
    }
  }

  const mean = landCounts.reduce((a, b) => a + b, 0) / landCounts.length;
  const variance = landCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / landCounts.length;
  const stddev = Math.sqrt(variance);
  const zero = landCounts.filter((n) => n === 0).length / 100;
  const one = landCounts.filter((n) => n === 1).length / 100;

  const categoryHitByTurn3: Record<string, number> = {};
  for (const cat of categories) {
    categoryHitByTurn3[cat] = (categoryHits[cat] ?? 0) / 100;
  }

  return {
    keepRate: kept / 100,
    categoryHitByTurn3,
    manaStats: { mean, stddev, zero, one },
    sampleKeep,
    sampleMull,
  };
}
