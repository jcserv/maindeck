import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-4.5 h-4.5 px-1.25 rounded-sm border bg-muted text-muted-foreground font-mono text-[10.5px] font-medium leading-none",
        className,
      )}
      {...props}
    />
  );
}
