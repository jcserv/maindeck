import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { parseOracle } from "@/lib/card/oracle-symbols";

interface OracleTextProps {
  text: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function OracleText({ text, className, size = "md" }: OracleTextProps) {
  const tokens = parseOracle(text);
  if (tokens.length === 0) return null;

  const sizeClass =
    size === "lg" ? "ms-lg" : size === "sm" ? "ms-cost ms-shadow" : "ms-cost";

  return (
    <p
      className={cn(
        "font-display text-[15px] leading-relaxed whitespace-pre-line",
        className,
      )}
    >
      {tokens.map((tok, i) =>
        tok.kind === "text" ? (
          <Fragment key={i}>{tok.value}</Fragment>
        ) : (
          <i
            key={i}
            className={cn("ms align-[-0.05em]", `ms-${tok.value}`, sizeClass)}
            aria-hidden
          />
        ),
      )}
    </p>
  );
}
