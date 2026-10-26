"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteDeckDialog } from "@/app/_components/deck/delete-deck-dialog";

interface DeletePackageButtonProps {
  packageId: string;
  packageName: string;
}

export function DeletePackageButton({
  packageId,
  packageName,
}: DeletePackageButtonProps) {
  return (
    <DeleteDeckDialog
      deckId={packageId}
      deckName={packageName}
      noun="package"
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Delete package"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      }
    />
  );
}
