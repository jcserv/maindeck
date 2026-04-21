import * as React from "react";
import { cn } from "@/lib/utils";

type FormErrorProps = {
  className?: string;
  children?: React.ReactNode;
};

export function FormError({ className, children }: FormErrorProps) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      {children}
    </p>
  );
}
