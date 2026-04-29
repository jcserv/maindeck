"use client";

import { Download, History, MoreHorizontal, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "@/app/_components/link";
import { DuplicateDeckButton } from "@/app/_components/duplicate-deck-button";
import { ExportDialog } from "@/app/_components/export-dialog";
import { DeleteDeckDialog } from "@/app/_components/delete-deck-dialog";

interface DeckActionRowProps {
  deckId: string;
  deckName: string;
  isOwner: boolean;
  isPrivate: boolean;
}

const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm text-left outline-none cursor-default hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0";

export function DeckActionRow({
  deckId,
  deckName,
  isOwner,
  isPrivate,
}: DeckActionRowProps) {
  if (!isOwner) {
    if (isPrivate) return null;
    return (
      <div className="flex items-center gap-2">
        <DuplicateDeckButton deckId={deckId} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DuplicateDeckButton deckId={deckId} />

      <ExportDialog
        deckId={deckId}
        deckName={deckName}
        trigger={
          <Button type="button" variant="outline" size="sm">
            <Download className="size-3.5" aria-hidden />
            Export
          </Button>
        }
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="More deck actions"
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          <Link href={`/deck/${deckId}/import`} className={menuItemClass}>
            <Upload aria-hidden />
            Import
          </Link>
          <Link href={`/deck/${deckId}/history`} className={menuItemClass}>
            <History aria-hidden />
            History
          </Link>
          <DropdownMenuSeparator />
          <DeleteDeckDialog
            deckId={deckId}
            deckName={deckName}
            trigger={
              <button
                type="button"
                className={`${menuItemClass} text-destructive hover:text-destructive focus-visible:text-destructive`}
              >
                <Trash2 aria-hidden />
                Delete deck
              </button>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
