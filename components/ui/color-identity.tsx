import { cn } from "@/lib/utils";

const COLOR_SWATCH: Record<string, string> = {
  W: "bg-[#f8f0d1] border-[#d8c98a]",
  U: "bg-[#0e68ab] border-[#0a4f81]",
  B: "bg-[#1a1512] border-[#3a332e]",
  R: "bg-[#d3202a] border-[#9b1820]",
  G: "bg-[#00733e] border-[#005529]",
  C: "bg-stone-300 border-stone-400",
};

interface ColorIdentityProps {
  colors: readonly string[] | null | undefined;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<ColorIdentityProps["size"]>, string> = {
  xs: "size-2",
  sm: "size-2.5",
  md: "size-3",
};

export function ColorIdentity({
  colors,
  size = "sm",
  className,
}: ColorIdentityProps) {
  const sz = SIZE_CLASS[size];
  if (!colors || colors.length === 0) {
    return (
      <span
        aria-label="Colorless"
        className={cn("inline-block rounded-full border bg-muted", sz, className)}
      />
    );
  }
  return (
    <span
      aria-label={colors.join("")}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {colors.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className={cn(
            "inline-block rounded-full border",
            sz,
            COLOR_SWATCH[c] ?? "bg-muted border-border",
          )}
        />
      ))}
    </span>
  );
}
