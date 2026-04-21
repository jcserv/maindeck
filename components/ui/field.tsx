import * as React from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: React.ReactNode;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function Field({
  label,
  htmlFor,
  required,
  optional,
  error,
  hint,
  className,
  children,
}: FieldProps) {
  const descriptionId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {optional && (
          <span className="ml-1 text-muted-foreground font-normal">
            (optional)
          </span>
        )}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
