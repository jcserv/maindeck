"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getActionErrorMessage } from "@/lib/telemetry";
import type { Format } from "@/lib/generated/prisma/enums";
import Link from "@/app/_components/link";
import { applyPackageToDeck } from "@/app/_actions/deck/packages";

interface TargetDeck {
  id: string;
  name: string;
  format: Format;
}

interface ApplyToDeckDialogProps {
  packageId: string;
  packageName: string;
  decks: TargetDeck[];
}

type ApplyResult = { deck: TargetDeck; added: number; skipped: string[] };

function formatLabel(format: Format): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

export function ApplyToDeckDialog({
  packageId,
  packageName,
  decks,
}: ApplyToDeckDialogProps) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [, startApply] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResult(null);
      setError(null);
    }
  }

  function handleApply(deck: TargetDeck) {
    setError(null);
    setResult(null);
    setApplyingId(deck.id);
    startApply(async () => {
      try {
        const { added, skipped } = await applyPackageToDeck(deck.id, packageId);
        setResult({ deck, added, skipped });
      } catch (err) {
        setError(getActionErrorMessage(err, "Could not add package."));
      } finally {
        setApplyingId(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="sm">
            <Package className="size-4" aria-hidden />
            Add to deck
          </Button>
        }
      />
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {packageName} to a deck</DialogTitle>
          <DialogDescription>
            Copies this package&apos;s cards into the deck, keeping their
            categories. Cards already in the deck are skipped.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <p role="status" className="text-sm text-muted-foreground">
            {result.added > 0
              ? `Added ${result.added} card${result.added !== 1 ? "s" : ""} to `
              : "Nothing new to add to "}
            <Link
              href={`/deck/${result.deck.id}`}
              className="font-medium text-foreground underline"
            >
              {result.deck.name}
            </Link>
            .
            {result.skipped.length > 0 &&
              ` Skipped ${result.skipped.length} already in the deck: ${result.skipped.join(", ")}.`}
          </p>
        )}

        {decks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You don&apos;t have any decks yet.{" "}
            <Link href="/deck/new" className="underline hover:text-foreground">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="flex max-h-[320px] flex-col divide-y overflow-y-auto rounded-md border">
            {decks.map((deck) => (
              <li
                key={deck.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{deck.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatLabel(deck.format)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={applyingId !== null}
                  onClick={() => handleApply(deck)}
                  aria-label={`Add ${packageName} to ${deck.name}`}
                >
                  {applyingId === deck.id ? "Adding…" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
