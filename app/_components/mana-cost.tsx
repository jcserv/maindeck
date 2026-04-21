import { cn } from "@/lib/utils";

interface ManaCostProps {
  cost: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

// Convert a Scryfall-style symbol body (e.g. "W", "2", "W/U", "2/W", "W/P")
// into the suffix used by the mana-font CSS classes (e.g. "w", "2", "wu", "2w", "wp").
function manaSlug(inner: string): string {
  return inner.toLowerCase().replace(/\//g, "");
}

export function ManaCost({ cost, className, size = "sm" }: ManaCostProps) {
  const tokens = cost.match(/\{[^}]+\}/g);
  if (!tokens || tokens.length === 0) return null;

  const sizeClass =
    size === "lg" ? "ms-lg" : size === "md" ? "ms-cost" : "ms-cost ms-shadow";

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={cost}
    >
      {tokens.map((raw, i) => {
        const inner = raw.slice(1, -1);
        return (
          <i
            key={i}
            className={cn("ms", `ms-${manaSlug(inner)}`, sizeClass)}
            aria-hidden
          />
        );
      })}
    </span>
  );
}
