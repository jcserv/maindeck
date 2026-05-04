"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { FormSuccess } from "@/components/ui/form-success";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/app/_actions/auth";

type EditableFieldProps = {
  label: string;
  name: string;
  initialValue: string;
  type?: "text" | "email" | "date";
  autoComplete?: string;
  minLength?: number;
  pattern?: string;
  max?: string;
  required?: boolean;
  successMessage: string | ((submitted: string) => string);
  onSave: (value: string) => Promise<ActionResult>;
  /**
   * When true, the displayed value reverts to the previously-committed value
   * after a successful save — used for email, where the server only dispatches
   * a verification link and the address isn't yet confirmed.
   */
  resetOnSuccess?: boolean;
};

export function EditableField({
  label,
  name,
  initialValue,
  type = "text",
  autoComplete,
  minLength,
  pattern,
  max,
  required,
  successMessage,
  onSave,
  resetOnSuccess = false,
}: EditableFieldProps) {
  const [committedValue, setCommittedValue] = useState(initialValue);
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const changed = value !== committedValue;
  const showSave = editing && changed;

  const startEdit = () => {
    setEditing(true);
    setError(null);
    setSuccess(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancel = () => {
    setValue(committedValue);
    setEditing(false);
    setError(null);
  };

  const save = () => {
    const submitted = value;
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await onSave(submitted);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(
        typeof successMessage === "function"
          ? successMessage(submitted)
          : successMessage,
      );
      setEditing(false);
      if (resetOnSuccess) {
        setValue(committedValue);
      } else {
        setCommittedValue(submitted);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editing) return;
    if (e.key === "Enter" && showSave) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          readOnly={!editing}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          pattern={pattern}
          max={max}
          className={cn(
            "min-h-11 flex-1",
            !editing &&
              "bg-input/50 opacity-60 cursor-default dark:bg-input/80",
          )}
        />
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={startEdit}
            disabled={pending}
            aria-label={`Edit ${label.toLowerCase()}`}
          >
            <Pencil />
          </Button>
        )}
        {showSave && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={save}
            disabled={pending}
            aria-label={`Save ${label.toLowerCase()}`}
          >
            <Check />
          </Button>
        )}
        {editing && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={cancel}
            disabled={pending}
            aria-label={`Cancel editing ${label.toLowerCase()}`}
          >
            <X />
          </Button>
        )}
      </div>
      {error && <FormError>{error}</FormError>}
      {success && <FormSuccess>{success}</FormSuccess>}
    </div>
  );
}
