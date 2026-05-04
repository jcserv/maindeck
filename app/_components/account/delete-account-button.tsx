"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
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
import { deleteAccount } from "@/app/_actions/auth";
import { isNextControlFlow } from "@/lib/telemetry";

interface DeleteAccountButtonProps {
  username: string;
}

export function DeleteAccountButton({ username }: DeleteAccountButtonProps) {
  const [typedUsername, setTypedUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canConfirm = typedUsername === username;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteAccount();
      } catch (err) {
        if (isNextControlFlow(err)) throw err;
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setTypedUsername("");
      setError(null);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            Delete account
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. All your decks and data will be permanently deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {error && <FormError>{error}</FormError>}
          <Field
            label={
              <>
                Type <span className="font-mono font-semibold">{username}</span> to confirm
              </>
            }
            htmlFor="confirm-username"
            required
          >
            <Input
              id="confirm-username"
              name="confirm-username"
              type="text"
              autoComplete="off"
              value={typedUsername}
              onChange={(e) => setTypedUsername(e.target.value)}
              className="min-h-11"
            />
          </Field>
        </div>

        <DialogFooter>
          <div className="flex justify-end gap-2 w-full">
            <DialogClose
              render={<Button type="button" variant="outline" size="sm" />}
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canConfirm || pending}
              onClick={handleConfirm}
            >
              {pending ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
