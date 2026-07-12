import type { ReactNode } from "react";
import { deltaKey, type RevisionDelta } from "@/lib/deck/revision";
import { groupDeltasByZone } from "@/lib/deck/group-deltas";
import type { Zone } from "@/lib/generated/prisma/enums";

const ZONE_LABEL: Record<Zone, string> = {
  MAINBOARD: "Mainboard",
  SIDEBOARD: "Sideboard",
  CONSIDERING: "Considering",
  COMMANDER: "Commander",
  COMPANION: "Companion",
};

export function RevisionDiff({
  deltas,
  renderRowStart,
}: {
  deltas: readonly RevisionDelta[];
  renderRowStart?: ((delta: RevisionDelta, key: string) => ReactNode) | undefined;
}) {
  const grouped = groupDeltasByZone(deltas);

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(({ zone, deltas: zoneDeltas }) => (
        <div key={zone} className="flex flex-col gap-1">
          {grouped.length > 1 && (
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {ZONE_LABEL[zone]}
            </div>
          )}
          <ul className="flex flex-col gap-0.5 text-sm">
            {zoneDeltas.map((d) => {
              const key = deltaKey(d);
              return (
                <li key={key} className="flex items-center gap-2 tabular-nums">
                  {renderRowStart?.(d, key)}
                  <span
                    className={
                      d.delta > 0
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : "text-red-600 dark:text-red-400 font-medium"
                    }
                  >
                    {d.delta > 0 ? `+${d.delta}` : d.delta}
                  </span>
                  <span>{d.cardName || `Card #${d.cardId}`}</span>
                  {d.categories.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({d.categories.join(", ")})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
