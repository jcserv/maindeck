import { computeRoleDistribution, DECK_ROLES } from "@/lib/stats/roles";
import type { DeckCardWithRelations } from "@/lib/stats/compute";
import { Eyebrow } from "@/components/ui/eyebrow";

interface RoleBarProps {
  cards: DeckCardWithRelations[];
}

const ROLE_ACCENT: Record<string, string> = {
  Ramp: "bg-green-500/70",
  Draw: "bg-blue-500/70",
  Removal: "bg-rose-500/70",
  Protection: "bg-violet-500/70",
  Creatures: "bg-amber-500/70",
  Lands: "bg-stone-400",
  Other: "bg-muted-foreground/40",
};

export function RoleBar({ cards }: RoleBarProps) {
  const dist = computeRoleDistribution(cards);
  const total = Object.values(dist).reduce((s, n) => s + n, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Eyebrow>Roles</Eyebrow>
        <p className="text-xs text-muted-foreground">
          Add cards to see role distribution.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>Roles</Eyebrow>
      <div
        className="flex h-2 w-full rounded-full overflow-hidden bg-muted"
        role="img"
        aria-label="Role distribution bar"
      >
        {DECK_ROLES.map((role) => {
          const n = dist[role];
          if (n === 0) return null;
          return (
            <div
              key={role}
              className={ROLE_ACCENT[role] ?? "bg-muted-foreground/40"}
              style={{ width: `${(n / total) * 100}%` }}
              aria-label={`${role}: ${n}`}
              title={`${role}: ${n}`}
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {DECK_ROLES.map((role) => {
          const n = dist[role];
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <li key={role} className="flex items-center gap-2">
              <span
                className={`inline-block size-2 rounded-sm ${ROLE_ACCENT[role] ?? "bg-muted-foreground/40"}`}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">{role}</span>
              <span className="tabular-nums text-foreground">
                {n}
                <span className="text-muted-foreground"> · {pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
