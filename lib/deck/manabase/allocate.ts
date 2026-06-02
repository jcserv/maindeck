/**
 * Pure basics-allocation logic for the "Add lands" flow. No Prisma, no I/O —
 * fully unit-testable.
 *
 * Given a deck's color-pip skew and a number of basic-land slots to fill, split
 * the slots across the five basic colors proportional to the skew, using
 * largest-remainder (Hamilton) rounding so the parts always sum exactly to the
 * slot count.
 */

export interface PipSkew {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
}

type BasicAllocation = PipSkew;

const COLORS = ["W", "U", "B", "R", "G"] as const;
type Color = (typeof COLORS)[number];

/**
 * Allocate `slots` basic lands across colors proportional to `pips`.
 *
 * - Colored split uses largest-remainder rounding; leftover after flooring goes
 *   to the colors with the largest fractional remainder, tie-broken in WUBRG
 *   order.
 * - When `opts.colorIdentity` is provided and non-empty, only those colors are
 *   eligible (a U/B deck never gets Mountains). If the deck has no colored pips
 *   yet, the slots are split evenly across the identity colors.
 * - A genuinely colorless deck (no eligible colored slots) gets all `C`.
 */
export function allocateBasics(
  pips: PipSkew,
  slots: number,
  opts?: { colorIdentity?: string[] },
): BasicAllocation {
  const result: BasicAllocation = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (slots <= 0) return result;

  let eligible: Color[];
  if (opts?.colorIdentity && opts.colorIdentity.length > 0) {
    const id = new Set(opts.colorIdentity);
    eligible = COLORS.filter((c) => id.has(c));
  } else {
    eligible = COLORS.filter((c) => pips[c] > 0);
  }

  if (eligible.length === 0) {
    result.C = slots;
    return result;
  }

  const pipTotal = eligible.reduce((sum, c) => sum + pips[c], 0);
  // Fall back to an even split when the deck has eligible colors but no pips
  // yet (e.g. a freshly created U/B deck).
  const useEven = pipTotal <= 0;
  const weightTotal = useEven ? eligible.length : pipTotal;

  const quotas = eligible.map((c) => {
    const weight = useEven ? 1 : pips[c];
    return { color: c, quota: (slots * weight) / weightTotal };
  });

  let assigned = 0;
  for (const { color, quota } of quotas) {
    const floored = Math.floor(quota);
    result[color] = floored;
    assigned += floored;
  }

  let leftover = slots - assigned;
  const byRemainder = quotas
    .map((q) => ({
      color: q.color,
      remainder: q.quota - Math.floor(q.quota),
      order: COLORS.indexOf(q.color),
    }))
    .sort((a, b) => b.remainder - a.remainder || a.order - b.order);

  for (let i = 0; leftover > 0; i++, leftover--) {
    result[byRemainder[i % byRemainder.length]!.color]++;
  }

  return result;
}

/**
 * How many basic-land slots the "Add lands" flow should suggest filling:
 * `targetLands - currentLands - manualPicks`, floored at zero. `manualPicks` is
 * the number of nonbasic lands the user has already chosen, so basics top up
 * toward the format's land target without overshooting.
 */
export function basicsSlotTarget(
  targetLands: number,
  currentLands: number,
  manualPicks: number,
): number {
  return Math.max(0, targetLands - currentLands - manualPicks);
}
