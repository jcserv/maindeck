import type { Zone } from "@/lib/generated/prisma/enums";
import type { RevisionDelta } from "@/lib/deck/revision";

const ZONE_ORDER: Zone[] = [
  "COMMANDER",
  "COMPANION",
  "MAINBOARD",
  "SIDEBOARD",
  "CONSIDERING",
];

/**
 * Groups revision-shaped deltas by zone in a fixed display order (commander
 * first, then companion/mainboard/sideboard/considering), each zone's deltas
 * sorted additions-first then alphabetically. Shared by the revision history
 * list and the proposal review list, which render the same delta shape.
 */
export function groupDeltasByZone(
  deltas: readonly RevisionDelta[],
): Array<{ zone: Zone; deltas: RevisionDelta[] }> {
  const byZone = new Map<Zone, RevisionDelta[]>();
  for (const d of deltas) {
    const list = byZone.get(d.zone) ?? [];
    list.push(d);
    byZone.set(d.zone, list);
  }
  return ZONE_ORDER.filter((z) => byZone.has(z)).map((zone) => ({
    zone,
    deltas: byZone
      .get(zone)!
      .slice()
      .sort((a, b) => {
        const signDiff = Math.sign(b.delta) - Math.sign(a.delta);
        if (signDiff !== 0) return signDiff;
        return a.cardName.localeCompare(b.cardName);
      }),
  }));
}
