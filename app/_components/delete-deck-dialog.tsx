"use client";

import { type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteDeck } from "@/lib/deck/actions";

interface DeleteDeckDialogProps {
  deckId: string;
  deckName: string;
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeleteDeckDialog({
  deckId,
  deckName,
  trigger,
  open,
  onOpenChange,
}: DeleteDeckDialogProps) {
  return (
    <ConfirmDialog
      title="Delete deck?"
      description={`Are you sure you want to delete "${deckName}"? This action cannot be undone.`}
      trigger={trigger ?? <Button variant="destructive" size="sm">Delete</Button>}
      confirmLabel="Delete deck"
      pendingLabel="Deleting…"
      onConfirm={() => deleteDeck(deckId)}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
