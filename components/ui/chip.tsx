import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1 h-[18px] px-1.5 rounded-sm border text-[10.5px] font-medium uppercase tracking-wide font-mono",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground border-border",
        accent:
          "bg-primary/10 text-primary border-primary/30 dark:bg-primary/20",
        success:
          "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
        warning:
          "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
        destructive:
          "bg-destructive/10 text-destructive border-destructive/30",
      },
      size: {
        sm: "h-[18px] px-1.5 text-[10.5px]",
        md: "h-5 px-2 text-[11px]",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "sm",
    },
  },
);

export interface ChipProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export function Chip({ className, tone, size, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone, size }), className)} {...props} />
  );
}
