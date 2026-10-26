"use client";

import { type ReactElement } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteDeck } from "@/app/_actions/deck/crud";

interface DeleteDeckDialogProps {
  deckId: string;
  deckName: string;
  noun?: "deck" | "package";
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeleteDeckDialog({
  deckId,
  deckName,
  noun = "deck",
  trigger,
  open,
  onOpenChange,
}: DeleteDeckDialogProps) {
  return (
    <ConfirmDialog
      title={`Delete ${noun}?`}
      description={`Are you sure you want to delete "${deckName}"? This action cannot be undone.`}
      {...(trigger && { trigger })}
      confirmLabel={`Delete ${noun}`}
      pendingLabel="Deleting…"
      onConfirm={() => deleteDeck(deckId)}
      {...(open !== undefined && { open })}
      {...(onOpenChange !== undefined && { onOpenChange })}
    />
  );
}
