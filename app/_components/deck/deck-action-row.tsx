"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  GitCompareArrows,
  GitFork,
  History,
  MoreHorizontal,
  Swords,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
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
import { SaveDeckButton } from "@/app/_components/deck/save-deck-button";
import { ExportDialog } from "@/app/_components/builder/export-dialog";
import { DeleteDeckDialog } from "@/app/_components/deck/delete-deck-dialog";
import { LikeButton } from "@/app/_components/deck/like-button";
import { useMenuShortcuts } from "@/app/_components/hotkeys/use-menu-shortcuts";
import { fireDeckAction } from "@/app/_components/hotkeys/deck-actions-bus";
import { duplicateDeck } from "@/app/_actions/deck/duplicate";

interface DeckActionRowProps {
  deckId: string;
  deckName: string;
  isOwner: boolean;
  isPrivate: boolean;
  /** True when a session exists. Drives the Save button (logged-in only). */
  viewerLoggedIn: boolean;
  /** Initial saved state, looked up server-side so the toggle has correct UI on first paint. */
  initialSaved: boolean;
  /**
   * When supplied, render the Like button. The page only passes this when the
   * viewer is signed in and the deck is PUBLIC — likes don't apply elsewhere.
   */
  like?: {
    likeCount: number;
    liked: boolean;
  };
  /**
   * True when this viewer should see the "Collaborate" entry — the owner
   * (reviews proposals) or an eligible collaborator (proposes changes).
   */
  showCollaborate?: boolean;
  /** Owner-only: count of PENDING proposals awaiting review. */
  pendingProposalCount?: number;
}

export function DeckActionRow({
  deckId,
  deckName,
  isOwner,
  isPrivate,
  viewerLoggedIn,
  initialSaved,
  like,
  showCollaborate,
  pendingProposalCount,
}: DeckActionRowProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forkPending, startForkTransition] = useTransition();

  const handlePlaytest = () => {
    setMenuOpen(false);
    router.push(`/deck/${deckId}/play`);
  };

  const handleFork = () => {
    setMenuOpen(false);
    startForkTransition(async () => {
      const { id } = await duplicateDeck(deckId);
      router.push(`/deck/${id}`);
    });
  };

  const handleExport = () => {
    setMenuOpen(false);
    fireDeckAction("export");
  };

  const onMenuKeyDown = useMenuShortcuts([
    { key: "p", action: handlePlaytest },
    { key: "f", action: handleFork, disabled: forkPending },
    { key: "e", action: handleExport },
    {
      key: "i",
      action: () => {
        setMenuOpen(false);
        router.push(`/deck/${deckId}/import`);
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

  const showSave = viewerLoggedIn && !isPrivate;

  if (!isOwner) {
    if (isPrivate) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <DuplicateDeckButton deckId={deckId} />
        {showSave && (
          <SaveDeckButton deckId={deckId} initialSaved={initialSaved} />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePlaytest}
        >
          <Swords className="size-3.5" aria-hidden />
          Playtest
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push(`/deck/${deckId}/history`)}
        >
          <History className="size-3.5" aria-hidden />
          History
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push(`/decks/compare?b=${deckId}`)}
        >
          <GitCompareArrows className="size-3.5" aria-hidden />
          Compare
        </Button>
        {showCollaborate && <CollaborateButton deckId={deckId} />}
        {like && (
          <LikeButton
            deckId={deckId}
            likeCount={like.likeCount}
            liked={like.liked}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSave && (
        <SaveDeckButton deckId={deckId} initialSaved={initialSaved} />
      )}

      {like && (
        <LikeButton
          deckId={deckId}
          likeCount={like.likeCount}
          liked={like.liked}
        />
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => router.push(`/deck/${deckId}/history`)}
      >
        <History className="size-3.5" aria-hidden />
        History
      </Button>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="More deck actions"
              className="relative"
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden />
          {!!pendingProposalCount && pendingProposalCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {pendingProposalCount}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]" onKeyDown={onMenuKeyDown}>
          <DropdownMenuItem
            onClick={() => router.push(`/decks/compare?a=${deckId}`)}
            className="gap-2"
          >
            <GitCompareArrows className="size-3.5 shrink-0" aria-hidden />
            <span>Compare</span>
          </DropdownMenuItem>
          {showCollaborate && (
            <DropdownMenuItem
              onClick={() => router.push(`/deck/${deckId}/collaborate`)}
              className="gap-2"
            >
              <Users className="size-3.5 shrink-0" aria-hidden />
              <span>Collaborate</span>
              {!!pendingProposalCount && pendingProposalCount > 0 && (
                <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {pendingProposalCount}
                </span>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handlePlaytest} className="gap-2">
            <Swords className="size-3.5 shrink-0" aria-hidden />
            <span>Playtest</span>
            <DropdownMenuShortcut>P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleFork}
            disabled={forkPending}
            className="gap-2"
          >
            <GitFork className="size-3.5 shrink-0" aria-hidden />
            <span>{forkPending ? "Forking…" : "Fork"}</span>
            <DropdownMenuShortcut>F</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport} className="gap-2">
            <Download className="size-3.5 shrink-0" aria-hidden />
            <span>Export</span>
            <DropdownMenuShortcut>E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/deck/${deckId}/import`)}
            className="gap-2"
          >
            <Upload className="size-3.5 shrink-0" aria-hidden />
            <span>Import</span>
            <DropdownMenuShortcut>I</DropdownMenuShortcut>
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

      <ExportDialog deckId={deckId} deckName={deckName} />

      <DeleteDeckDialog
        deckId={deckId}
        deckName={deckName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}

function CollaborateButton({
  deckId,
  pendingProposalCount,
}: {
  deckId: string;
  pendingProposalCount?: number | undefined;
}) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => router.push(`/deck/${deckId}/collaborate`)}
    >
      <Users className="size-3.5" aria-hidden />
      Collaborate
      {!!pendingProposalCount && pendingProposalCount > 0 && (
        <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {pendingProposalCount}
        </span>
      )}
    </Button>
  );
}
