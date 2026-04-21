import * as React from "react";
import { cn } from "@/lib/utils";

type FormSuccessProps = {
  className?: string;
  children?: React.ReactNode;
};

export function FormSuccess({ className, children }: FormSuccessProps) {
  if (!children) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      {children}
    </p>
  );
}
