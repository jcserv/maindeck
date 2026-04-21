import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const EYEBROW_CLASS =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono";

export function Eyebrow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(EYEBROW_CLASS, className)} {...props} />;
}
