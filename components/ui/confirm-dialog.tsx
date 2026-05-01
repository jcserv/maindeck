"use client";

import * as React from "react";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { isNextControlFlow } from "@/lib/telemetry";
import type { VariantProps } from "class-variance-authority";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];

type ConfirmDialogProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  trigger?: React.ReactElement;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Standard "are you sure?" confirm dialog. Owns the pending state + error
 * capture so call sites only provide copy and the confirm handler. Re-throws
 * NEXT_REDIRECT so `redirect()` inside onConfirm still navigates.
 */
export function ConfirmDialog({
  title,
  description,
  trigger,
  confirmLabel = "Confirm",
  pendingLabel,
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        await onConfirm();
      } catch (err) {
        if (isNextControlFlow(err)) throw err;
        setError("Something went wrong. Please try again.");
      }
    });
  };

  // When opened, focus the confirm button so Enter triggers it
  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {error && <FormError>{error}</FormError>}

        <DialogFooter>
          <div className="flex justify-end gap-2 w-full">
            <DialogClose
              render={<Button type="button" variant="outline" size="sm" />}
            >
              {cancelLabel}
            </DialogClose>
            <Button
              ref={confirmButtonRef}
              type="button"
              variant={variant}
              size="sm"
              disabled={pending}
              onClick={handleClick}
            >
              {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
