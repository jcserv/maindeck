"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, History, MoreHorizontal, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DuplicateDeckButton } from "@/app/_components/deck/duplicate-deck-button";
import { ExportDialog } from "@/app/_components/builder/export-dialog";
import { DeleteDeckDialog } from "@/app/_components/deck/delete-deck-dialog";
import { useMenuShortcuts } from "@/app/_components/hotkeys/use-menu-shortcuts";

interface DeckActionRowProps {
  deckId: string;
  deckName: string;
  isOwner: boolean;
  isPrivate: boolean;
}

export function DeckActionRow({
  deckId,
  deckName,
  isOwner,
  isPrivate,
}: DeckActionRowProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const onMenuKeyDown = useMenuShortcuts([
    {
      key: "i",
      action: () => {
        setMenuOpen(false);
        router.push(`/deck/${deckId}/import`);
      },
    },
    {
      key: "h",
      action: () => {
        setMenuOpen(false);
        router.push(`/deck/${deckId}/history`);
      },
    },
    {
      key: "d",
      action: () => {
        setMenuOpen(false);
        setDeleteOpen(true);
      },
    },
  ]);

  if (!isOwner) {
    if (isPrivate) return null;
    return (
      <div className="flex items-center gap-2">
        <DuplicateDeckButton deckId={deckId} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push(`/deck/${deckId}/history`)}
        >
          <History className="size-3.5" aria-hidden />
          History
        </Button>
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

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
        <DropdownMenuContent align="end" className="min-w-[180px]" onKeyDown={onMenuKeyDown}>
          <DropdownMenuItem
            onClick={() => router.push(`/deck/${deckId}/import`)}
            className="gap-2"
          >
            <Upload className="size-3.5 shrink-0" aria-hidden />
            <span>Import</span>
            <DropdownMenuShortcut>I</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/deck/${deckId}/history`)}
            className="gap-2"
          >
            <History className="size-3.5 shrink-0" aria-hidden />
            <span>History</span>
            <DropdownMenuShortcut>H</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            className="gap-2"
          >
            <Trash2 className="size-3.5 shrink-0" aria-hidden />
            <span>Delete deck</span>
            <DropdownMenuShortcut>D</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteDeckDialog
        deckId={deckId}
        deckName={deckName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
